import { createWebSocketConnection, ConsoleLogger, toSocket, MessageSignature } from '@codingame/monaco-jsonrpc'
import { Uri } from 'monaco-editor'
import {
  MonacoLanguageClient,
  createConnection, ConnectionErrorHandler, ConnectionCloseHandler, IConnection, Middleware, ErrorHandler, IConnectionProvider, InitializeParams, RegistrationRequest, RegistrationParams
} from '@codingame/monaco-languageclient'
import delay from 'delay'
import once from 'once'
import { registerExtensionFeatures } from './extensions'
import { StaticLanguageClientOptions } from './staticOptions'

async function openConnection (url: URL | string, errorHandler: ConnectionErrorHandler, closeHandler: () => void): Promise<IConnection> {
  return new Promise((resolve, reject) => {
    const webSocket = new WebSocket(url)

    webSocket.onopen = () => {
      const socket = toSocket(webSocket)
      const webSocketConnection = createWebSocketConnection(socket, new ConsoleLogger())
      webSocketConnection.onDispose(() => {
        webSocket.close()
      })

      const onceCloseHandler = once(closeHandler)

      const connection = createConnection(webSocketConnection, errorHandler, onceCloseHandler)

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
            if ((args[0] as MessageSignature).method === RegistrationRequest.type.method) {
              const registrationParams = params[0] as unknown as RegistrationParams
              registrationParams.registrations = registrationParams.registrations.filter(registration => {
                return !existingRegistrations.has(registration.id)
              })
              registrationParams.registrations.forEach(registration => {
                existingRegistrations.add(registration.id)
              })
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
          onceCloseHandler()
        },
        shutdown: async () => {
          // The shutdown should NEVER fail or the connection is not closed and the lsp client is not properly cleaned
          // see https://github.com/microsoft/vscode-languageserver-node/blob/master/client/src/client.ts#L3103
          try {
            await connection.exit()
          } catch (error) {
            console.warn('[LSP]', 'Error while shutdown lsp', error)
          }
        }
      }
      resolve(fixedConnection)
    }
    webSocket.onerror = () => {
      reject(new Error('Unable to connect to server'))
    }
  })
}

const RETRY_DELAY = 3000
class CGLSPConnectionProvider implements IConnectionProvider {
  constructor (
    private serverAddress: string,
    private id: string,
    private sessionId: string | undefined,
    private libraryUrls: string[],
    private getSecurityToken: () => Promise<string>
  ) {
  }

  async get (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler) {
    try {
      const path = this.sessionId != null ? `run/${this.sessionId}/${this.id}` : `run/${this.id}`
      const url = new URL(path, this.serverAddress)
      this.libraryUrls.forEach(libraryUrl => url.searchParams.append('libraryUrl', libraryUrl))
      url.searchParams.append('token', await this.getSecurityToken())

      return await openConnection(url, errorHandler, closeHandler)
    } catch (err) {
      setTimeout(closeHandler, RETRY_DELAY)
      await delay(1000)
      throw err
    }
  }
}

function createLanguageClient (
  id: string,
  sessionId: string | undefined,
  {
    documentSelector,
    synchronize,
    initializationOptions
  }: StaticLanguageClientOptions,
  languageServerAddress: string,
  getSecurityToken: () => Promise<string>,
  libraryUrls: string[],
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
    connectionProvider: new CGLSPConnectionProvider(languageServerAddress, id, sessionId, libraryUrls, getSecurityToken)
  })

  client.registerProposedFeatures()

  registerExtensionFeatures(client, id)

  return client
}

export default createLanguageClient
