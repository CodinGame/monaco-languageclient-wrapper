import {
  AbstractMessageReader,
  AbstractMessageWriter,
  createMessageConnection,
  DataCallback,
  Disposable,
  HandlerResult,
  Message,
  MessageReader,
  MessageWriter,
  NotificationHandler,
  RequestHandler
} from 'vscode-languageserver-protocol'
import { createConnection, WatchDog, _Connection, _ } from 'vscode-languageserver'
import { monaco } from '@codingame/monaco-editor-wrapper'
import { MessageTransports } from 'vscode-languageclient/browser'
import { getFileStats, listFiles, StatFileResult, readFile, writeFile } from '../customRequests'
import { Infrastructure, LanguageClientId, LanguageClientManager, LanguageClientOptions } from '../'

class PipedMessageReader extends AbstractMessageReader {
  private callback: DataCallback | undefined
  private messages: Message[] = []

  listen(callback: DataCallback): Disposable {
    this.callback = callback
    for (const message of this.messages) {
      callback(message)
    }
    return {
      dispose: () => {
        if (this.callback === callback) {
          this.callback = undefined
        }
      }
    }
  }

  public sendMessage(data: Message) {
    this.messages.push(data)
    this.callback?.(data)
  }
}

class PipedMessageWriter extends AbstractMessageWriter implements MessageWriter {
  constructor(private reader: PipedMessageReader) {
    super()
  }

  async write(msg: Message): Promise<void> {
    this.reader.sendMessage(msg)
  }

  end(): void {
    super.fireClose()
  }
}

function createPipedReaderWriter(): [MessageReader, MessageWriter] {
  const reader = new PipedMessageReader()
  const writer = new PipedMessageWriter(reader)
  return [reader, writer]
}

export interface DeferredPromise<ValueType> {
  promise: Promise<ValueType>
  resolve(value?: ValueType | PromiseLike<ValueType>): void
  reject(reason?: unknown): void
}

function isDisposable(v: unknown): v is Disposable {
  return v != null && typeof (v as Disposable).dispose === 'function'
}

type ClientRequestHandler<Params, Result, Error> = [
  Params,
  (result: Awaited<HandlerResult<Result, Error>>) => void
]
export async function waitClientRequest<Params, Result, Error>(
  listen: (handler: RequestHandler<Params, Result, Error>) => unknown
): Promise<ClientRequestHandler<Params, Result, Error>> {
  const clientRequestHandlerPromise = new Promise<ClientRequestHandler<Params, Result, Error>>(
    (resolve) => {
      const disposable = listen((params: Params) => {
        if (isDisposable(disposable)) disposable.dispose()
        const deferred = Promise.withResolvers<Awaited<HandlerResult<Result, Error>>>()
        resolve([params, (result) => deferred.resolve(result)])
        return deferred.promise
      })
    }
  )
  return clientRequestHandlerPromise
}

export async function waitClientNotification<Params>(
  listen: (handler: NotificationHandler<Params>) => unknown
): Promise<Params> {
  return new Promise<Params>((resolve) => {
    let resolved = false
    const disposable = listen((params) => {
      if (isDisposable(disposable)) disposable.dispose()
      if (resolved) {
        throw new Error('Already resolved')
      }
      resolved = true
      resolve(params)
    })
  })
}

export class TestInfrastructure implements Infrastructure {
  private connectionDeferred = Promise.withResolvers<_Connection<_, _, _, _, _, _, _>>()

  constructor(
    public automaticTextDocumentUpdate: boolean,
    public _useMutualizedProxy: boolean,
    public connectionCreationDelay: number = 0
  ) {}

  useMutualizedProxy(languageClientId: LanguageClientId, options: LanguageClientOptions): boolean {
    return this._useMutualizedProxy && options.mutualizable
  }

  rootUri = 'file:///tmp/project'
  workspaceFolders = []

  public getConnection(): Promise<_Connection<_, _, _, _, _, _, _>> {
    return this.connectionDeferred.promise
  }

  // use same method as CodinGameInfrastructure to be able to simply catch it
  public async readFile(
    resource: monaco.Uri,
    languageClient: LanguageClientManager
  ): Promise<string> {
    return (await readFile(resource.toString(true), languageClient)).content
  }

  // use same method as CodinGameInfrastructure to be able to simply catch it
  public async writeFile(
    document: monaco.Uri,
    content: string,
    languageClient: LanguageClientManager
  ): Promise<void> {
    if (languageClient.isConnected()) {
      await writeFile(document.toString(), content, languageClient)
    }
  }

  public async getFileStats(
    directory: monaco.Uri,
    languageClient: LanguageClientManager
  ): Promise<StatFileResult> {
    return await getFileStats(directory.toString(true), languageClient)
  }

  public async listFiles(
    directory: monaco.Uri,
    languageClient: LanguageClientManager
  ): Promise<string[]> {
    try {
      return (await listFiles(directory.toString(true), languageClient)).files
    } catch {
      return []
    }
  }

  async openConnection(): Promise<MessageTransports> {
    const [r1, w1] = createPipedReaderWriter()
    const [r2, w2] = createPipedReaderWriter()

    const c2 = createMessageConnection(r2, w1)

    const watchDog: WatchDog = {
      shutdownReceived: false,
      initialize: function (): void {},
      exit: function (): void {}
    }
    const clientConnection = createConnection(() => c2, watchDog)
    await new Promise((resolve) => setTimeout(resolve, this.connectionCreationDelay))
    this.connectionDeferred.resolve(clientConnection)
    c2.listen()

    return {
      reader: r1,
      writer: w2
    }
  }
}
