import { MessageReader, MessageWriter, Message, Event, DataCallback, Disposable, PartialMessageInfo } from 'vscode-jsonrpc'
import {
  MonacoLanguageClient, Middleware, ErrorHandler, IConnectionProvider, MessageTransports
} from 'monaco-languageclient'
import { InitializeParams, InitializeRequest } from 'vscode-languageserver-protocol'
import { LanguageClientId, LanguageClientOptions } from './languageClientOptions'
import { Infrastructure } from './infrastructure'

interface MessageMiddleware {
  (message: Message): Message
}

class MiddlewareMessageWriter implements MessageWriter {
  constructor (private delegate: MessageWriter, private middleware: MessageMiddleware) {}

  onError: Event<[Error, Message | undefined, number | undefined]> = (cb) => {
    return this.delegate.onError(cb)
  }

  onClose: Event<void> = (cb) => {
    return this.delegate.onClose(cb)
  }

  dispose (): void {
    this.delegate.dispose()
  }

  write (msg: Message): Promise<void> {
    return this.delegate.write(this.middleware(msg))
  }

  end (): void {
    return this.delegate.end()
  }
}
class MiddlewareMessageReader implements MessageReader {
  constructor (private delegate: MessageReader, private middleware: MessageMiddleware) {}

  onError: Event<Error> = (cb) => {
    return this.delegate.onError(cb)
  }

  onClose: Event<void> = (cb) => {
    return this.delegate.onClose(cb)
  }

  onPartialMessage: Event<PartialMessageInfo> = (cb) => {
    return this.delegate.onPartialMessage(cb)
  }

  listen (callback: DataCallback): Disposable {
    return this.delegate.listen(message => {
      callback(this.middleware(message))
    })
  }

  dispose (): void {
    this.delegate.dispose()
  }
}

/**
 * Add some hacks on transform for:
 * - Fix paths on windows
 * @param transports The original transports
 * @returns The transformed transports
 */
function hackTransports (transports: MessageTransports): MessageTransports {
  return {
    reader: new MiddlewareMessageReader(transports.reader, message => {
      return message
    }),
    writer: new MiddlewareMessageWriter(transports.writer, message => {
      if (Message.isRequest(message) && message.method === InitializeRequest.type.method) {
        const params = message.params as InitializeParams
        // Hack to fix url converted from /toto/tata to \\toto\tata in windows
        const fixedParams: InitializeParams = {
          ...params,
          rootPath: params.rootPath?.replace(/\\/g, '/'),
          rootUri: params.rootUri?.replace(/\\/g, '/') ?? null
        }
        return {
          ...message,
          params: fixedParams
        }
      }
      return message
    })
  }
}

class CGLSPConnectionProvider implements IConnectionProvider {
  constructor (
    private id: LanguageClientId,
    private infrastructure: Infrastructure
  ) {
  }

  async get () {
    return hackTransports(await this.infrastructure.openConnection(this.id))
  }
}

async function createLanguageClient (
  id: LanguageClientId,
  infrastructure: Infrastructure,
  {
    documentSelector,
    synchronize,
    initializationOptions,
    createAdditionalFeatures
  }: LanguageClientOptions,
  errorHandler: ErrorHandler,
  middleware?: Middleware
): Promise<MonacoLanguageClient> {
  const allInitializationOptions = () => {
    const infrastructureInitOptions = infrastructure.getInitializationOptions?.()
    const languageInitOptions = typeof initializationOptions === 'function' ? initializationOptions() : initializationOptions
    if (infrastructureInitOptions != null || languageInitOptions != null) {
      return {
        ...(infrastructureInitOptions ?? {}),
        ...(languageInitOptions ?? {})
      }
    }
    return undefined
  }

  const client = new MonacoLanguageClient({
    id: `${id}-languageclient`,
    name: `CodinGame ${id} Language Client`,
    clientOptions: {
      // use a language id as a document selector
      documentSelector,
      // disable the default error handler
      errorHandler,
      middleware,
      synchronize,
      initializationOptions: allInitializationOptions
    },
    connectionProvider: new CGLSPConnectionProvider(id, infrastructure)
  })
  client.registerConfigurationFeatures()
  client.registerProgressFeatures()
  client.registerTextDocumentSaveFeatures()

  if (createAdditionalFeatures != null) {
    client.registerFeatures(await createAdditionalFeatures(client))
  }

  return client
}

export default createLanguageClient
