import { MessageSignature, MessageConnection } from '@codingame/monaco-jsonrpc'
import { Uri } from 'monaco-editor'
import {
  MonacoLanguageClient,
  createConnection, ConnectionErrorHandler, ConnectionCloseHandler, IConnection, Middleware, ErrorHandler, IConnectionProvider, InitializeParams, RegistrationRequest, RegistrationParams, UnregistrationRequest, UnregistrationParams, LanguageClientOptions
} from '@codingame/monaco-languageclient'
import once from 'once'
import { registerExtensionFeatures } from './extensions'
import { LanguageClientId } from './languageClientOptions'
import { Infrastructure } from './infrastructure'

async function messageConnectionToConnection (messageConnection: MessageConnection, errorHandler: ConnectionErrorHandler, closeHandler: () => void): Promise<IConnection> {
  const connection = createConnection(messageConnection, errorHandler, closeHandler)

  const existingRegistrations = new Set<string>()
  const fixedConnection: IConnection = {
    ...connection,
    initialize: (params: InitializeParams) => {
      // Hack to fix url converted from /toto/tata to \\toto\tata in windows
      const rootPath = params.rootPath?.replace(/\\/g, '/')
      const fixedParams: InitializeParams = {
        ...params,
        rootPath: rootPath,
        rootUri: rootPath != null ? Uri.from({ scheme: 'file', path: rootPath }).toString() : null
      }
      return connection.initialize(fixedParams)
    },
    onRequest (...args: Parameters<typeof connection.onRequest>) {
      return connection.onRequest(args[0], (...params) => {
        // Hack for https://github.com/OmniSharp/omnisharp-roslyn/issues/2119
        const method = (args[0] as MessageSignature).method
        if (method === RegistrationRequest.type.method) {
          const registrationParams = params[0] as unknown as RegistrationParams
          registrationParams.registrations = registrationParams.registrations.filter(registration => {
            const alreadyExisting = existingRegistrations.has(registration.id)
            if (alreadyExisting) {
              console.warn('Registration already existing', registration.id, registration.method)
            }
            return !alreadyExisting
          })
          registrationParams.registrations.forEach(registration => {
            existingRegistrations.add(registration.id)
          })
        }
        if (method === UnregistrationRequest.type.method) {
          const unregistrationParams = params[0] as unknown as UnregistrationParams
          for (const unregistration of unregistrationParams.unregisterations) {
            existingRegistrations.delete(unregistration.id)
          }
        }
        return args[1](...params)
      })
    },
    dispose: () => {
      try {
        connection.dispose()
      } catch (error) {
        // The dispose should NEVER fail or the lsp client is not properly cleaned
        // see https://github.com/microsoft/vscode-languageserver-node/blob/master/client/src/client.ts#L3105
        console.warn('[LSP]', 'Error while disposing connection', error)
      }
      // Hack, when the language client is removed, the connection is disposed but the closeHandler is not always properly called
      // The language client is then still active but without a proper connection and errors will occurs
      closeHandler()
    },
    shutdown: async () => {
      // The shutdown should NEVER fail or the connection is not closed and the lsp client is not properly cleaned
      // see https://github.com/microsoft/vscode-languageserver-node/blob/master/client/src/client.ts#L3103
      try {
        await connection.shutdown()
      } catch (error) {
        console.warn('[LSP]', 'Error while shutdown lsp', error)
      }
    }
  }

  return fixedConnection
}

const RETRY_DELAY = 3000
class CGLSPConnectionProvider implements IConnectionProvider {
  constructor (
    private id: LanguageClientId,
    private infrastructure: Infrastructure
  ) {
  }

  async get (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler) {
    const onceDelayedCloseHandler = once(() => {
      setTimeout(() => {
        closeHandler()
      }, RETRY_DELAY)
    })
    try {
      const connection = await this.infrastructure.openConnection(this.id)

      return await messageConnectionToConnection(connection, errorHandler, onceDelayedCloseHandler)
    } catch (err) {
      onceDelayedCloseHandler()
      throw err
    }
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
      initializationOptions
    },
    connectionProvider: new CGLSPConnectionProvider(id, infrastructure)
  })

  client.registerProposedFeatures()

  registerExtensionFeatures(client, id)

  return client
}

export default createLanguageClient
