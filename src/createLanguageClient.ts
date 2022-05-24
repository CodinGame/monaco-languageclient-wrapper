import { MessageReader, MessageWriter, Message, Event, DataCallback, Disposable, PartialMessageInfo } from 'vscode-jsonrpc'
import { Uri } from 'monaco-editor'
import {
  MonacoLanguageClient, Middleware, ErrorHandler, IConnectionProvider, InitializeParams, RegistrationRequest, RegistrationParams, UnregistrationRequest, UnregistrationParams, LanguageClientOptions, MessageTransports, InitializeRequest
} from 'monaco-languageclient'
import { WillSaveWaitUntilFeature } from 'vscode-languageclient/lib/common/textSynchronization'
import { FileSystemWatcherFeature } from 'vscode-languageclient/lib/common/fileSystemWatcher'
import { WillCreateFilesFeature, WillRenameFilesFeature, WillDeleteFilesFeature, DidRenameFilesFeature, DidCreateFilesFeature, DidDeleteFilesFeature } from 'vscode-languageclient/lib/common/fileOperations'
import { CallHierarchyFeature } from 'vscode-languageclient/lib/common/callHierarchy'
import { TypeHierarchyFeature } from 'vscode-languageclient/lib/common/typeHierarchy'
import { NotebookDocumentSyncFeature } from 'vscode-languageclient/lib/common/notebook'
import { DynamicFeature, StaticFeature } from 'vscode-languageclient/lib/common/api'
import { registerExtensionFeatures } from './extensions'
import { LanguageClientId } from './languageClientOptions'
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
 * - Dedup server capability registrations (for omnisharp roslyn)
 * - Fix paths on windows
 * @param transports The original transports
 * @returns The transformed transports
 */
function hackTransports (transports: MessageTransports): MessageTransports {
  const existingRegistrations = new Set<string>()
  return {
    reader: new MiddlewareMessageReader(transports.reader, message => {
      if (Message.isRequest(message)) {
        if (message.method === RegistrationRequest.type.method) {
          const registrationParams = message.params as RegistrationParams
          const filteredRegistrations = registrationParams.registrations.filter(registration => {
            const alreadyExisting = existingRegistrations.has(registration.id)
            if (alreadyExisting) {
              console.warn('Registration already existing', registration.id, registration.method)
            }
            return !alreadyExisting
          })
          registrationParams.registrations.forEach(registration => {
            existingRegistrations.add(registration.id)
          })
          const fixedParams: RegistrationParams = {
            ...registrationParams,
            registrations: filteredRegistrations
          }
          return {
            ...message,
            params: fixedParams
          }
        }
        if (message.method === UnregistrationRequest.type.method) {
          const unregistrationParams = message.params as UnregistrationParams
          for (const unregistration of unregistrationParams.unregisterations) {
            existingRegistrations.delete(unregistration.id)
          }
        }
      }
      return message
    }),
    writer: new MiddlewareMessageWriter(transports.writer, message => {
      if (Message.isRequest(message) && message.method === InitializeRequest.type.method) {
        const params = message.params as InitializeParams
        // Hack to fix url converted from /toto/tata to \\toto\tata in windows
        const rootPath = params.rootPath?.replace(/\\/g, '/')
        const fixedParams: InitializeParams = {
          ...params,
          rootPath,
          rootUri: rootPath != null ? Uri.from({ scheme: 'file', path: rootPath }).toString() : null
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

const IGNORED_DYNAMIC_FEATURES: Function[] = [
  FileSystemWatcherFeature,
  WillSaveWaitUntilFeature,
  NotebookDocumentSyncFeature,
  WillCreateFilesFeature,
  WillRenameFilesFeature,
  WillDeleteFilesFeature,
  DidRenameFilesFeature,
  DidCreateFilesFeature,
  DidDeleteFilesFeature,
  TypeHierarchyFeature,
  CallHierarchyFeature
]
class CodinGameMonacoLanguageClient extends MonacoLanguageClient {
  override registerFeature (feature: StaticFeature | DynamicFeature<unknown>): void {
    if (DynamicFeature.is(feature) && IGNORED_DYNAMIC_FEATURES.includes(feature.constructor)) {
      // ignore
      return
    }
    super.registerFeature(feature)
  }
}

function createLanguageClient (
  id: LanguageClientId,
  infrastructure: Infrastructure,
  {
    documentSelector,
    synchronize,
    initializationOptions
  }: LanguageClientOptions,
  errorHandler: ErrorHandler,
  middleware?: Middleware
): MonacoLanguageClient {
  const client = new CodinGameMonacoLanguageClient({
    id: `${id}-languageclient`,
    name: `CodinGame ${id} Language Client`,
    clientOptions: {
      // use a language id as a document selector
      documentSelector,
      // disable the default error handler
      errorHandler,
      middleware,
      synchronize,
      initializationOptions
    },
    connectionProvider: new CGLSPConnectionProvider(id, infrastructure)
  })

  registerExtensionFeatures(client, id)

  return client
}

export default createLanguageClient
