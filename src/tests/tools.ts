import { Uri } from 'monaco-editor'
import { AbstractMessageReader, AbstractMessageWriter, createMessageConnection, DataCallback, Disposable, Message, MessageConnection, MessageReader, MessageWriter, NotificationHandler, RequestHandler, ServerCapabilities, TextDocumentSyncKind } from 'vscode-languageserver-protocol'
import {
  createConnection,
  WatchDog,
  _Connection,
  _
} from 'vscode-languageserver/lib/common/api'
import { getFile, updateFile } from '../customRequests'
import { Infrastructure, LanguageClientManager, TextDocument, TextDocumentSaveReason } from '../'

class PipedMessageReader extends AbstractMessageReader {
  private callback: DataCallback | undefined
  private messages: Message[] = []

  listen (callback: DataCallback): Disposable {
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

  public sendMessage (data: Message) {
    this.messages.push(data)
    this.callback?.(data)
  }
}

class PipedMessageWriter extends AbstractMessageWriter implements MessageWriter {
  constructor (private reader: PipedMessageReader) {
    super()
  }

  async write (msg: Message): Promise<void> {
    this.reader.sendMessage(msg)
  }

  end (): void {
    super.fireClose()
  }
}

function createPipedReaderWriter (): [MessageReader, MessageWriter] {
  const reader = new PipedMessageReader()
  const writer = new PipedMessageWriter(reader)
  return [reader, writer]
}

function createDuplexConnection (): [MessageConnection, MessageConnection] {
  const [r1, w1] = createPipedReaderWriter()
  const [r2, w2] = createPipedReaderWriter()

  return [createMessageConnection(r1, w2), createMessageConnection(r2, w1)]
}

export interface DeferredPromise<ValueType> {
  promise: Promise<ValueType>
  resolve(value?: ValueType | PromiseLike<ValueType>): void
  reject(reason?: unknown): void
}

export default function pDefer<ValueType> (): DeferredPromise<ValueType> {
  let resolve: (value: ValueType | PromiseLike<ValueType>) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<ValueType>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  return {
    promise,
    resolve,
    reject
  }
}

function isDisposable (v: unknown): v is Disposable {
  return v != null && typeof (v as Disposable).dispose === 'function'
}

type ClientRequestHandler<Params, Result> = [Params, (result: Result) => void]
export async function waitClientRequest<Params, Result, Error> (listen: (handler: RequestHandler<Params, Result, Error>) => unknown): Promise<ClientRequestHandler<Params, Result>> {
  const clientRequestHandlerPromise = new Promise<ClientRequestHandler<Params, Result>>(resolve => {
    const disposable = listen((params: Params) => {
      if (isDisposable(disposable)) disposable.dispose()
      const deferred = pDefer<Result>()
      resolve([
        params,
        (result) => deferred.resolve(result)
      ])
      return deferred.promise
    })
  })
  return clientRequestHandlerPromise
}

export async function waitClientNotification<Params> (listen: (handler: NotificationHandler<Params>) => unknown): Promise<Params> {
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
  private connectionDeferred = pDefer<_Connection<_, _, _, _, _, _, _>>()

  constructor (
    public automaticTextDocumentUpdate: boolean,
    public useMutualizedProxy: boolean
  ) {}

  rootUri = 'file:///tmp/project'
  workspaceFolders = []

  public getConnection (): Promise<_Connection<_, _, _, _, _, _, _>> {
    return this.connectionDeferred.promise
  }

  // use same method as CodinGameInfrastructure to be able to simply catch it
  async getFileContent (resource: Uri, languageClient: LanguageClientManager): Promise<string | null> {
    try {
      return (await getFile(resource.toString(true), languageClient)).text
    } catch (error) {
      console.error('File not found', resource.toString())
      return null
    }
  }

  // use same method as CodinGameInfrastructure to be able to simply catch it
  public async saveFileContent (document: TextDocument, reason: TextDocumentSaveReason, languageClient: LanguageClientManager): Promise<void> {
    if (languageClient.isConnected()) {
      await updateFile(document.uri.toString(), document.getText(), languageClient)
    }
  }

  async openConnection (): Promise<MessageConnection> {
    const [c1, c2] = createDuplexConnection()

    const watchDog: WatchDog = {
      shutdownReceived: false,
      initialize: function (): void {},
      exit: function (): void {}
    }
    const clientConnection = createConnection(() => c2, watchDog)
    this.connectionDeferred.resolve(clientConnection)
    c2.listen()

    return c1
  }
}
