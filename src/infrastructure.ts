import { IWebSocket, WebSocketMessageReader, WebSocketMessageWriter, toSocket } from 'vscode-ws-jsonrpc'
import { MessageTransports } from 'vscode-languageclient'
import * as monaco from 'monaco-editor'
import * as vscode from 'vscode'
import { LSPAny } from 'vscode-languageserver-protocol'
import { getFile, updateFile } from './customRequests'
import { LanguageClientManager } from './languageClient'
import { LanguageClientId, LanguageClientOptions } from './languageClientOptions'

export interface Infrastructure {
  /**
   * Indicate if the file will be already up to date on the server or it it is required to send textDocument/save requests
   * - true = we shouldn't send textDocument/save request
   * - false = we should
   */
  automaticTextDocumentUpdate: boolean
  /**
   * Workspace root uri
   */
  rootUri: string
  /**
   * Workspace folders
   */
  workspaceFolders?: typeof vscode.workspace.workspaceFolders

  /**
   * Does a mutualization proxy will be used, it means we don't need to load configurations for this server
   */
  useMutualizedProxy (languageClientId: LanguageClientId, options: LanguageClientOptions): boolean

  /**
   * Save a file on the filesystem
   * @param document The document to save
   * @param reason The reason of the save
   * @param languageClient The languageclient we're trying to save the file to
   */
  saveFileContent? (document: monaco.Uri, content: string, languageClient: LanguageClientManager): Promise<void>
  /**
   * Get a text file content as a model
   * @param resource the Uri of the file
   * @param languageClient The languageclient we're trying to get the file from
   */
  getFileContent? (resource: monaco.Uri, languageClient: LanguageClientManager): Promise<string | undefined>

  /**
   * Open a connection to the language server
   * @param id The language server id
   */
  openConnection (id: LanguageClientId): Promise<MessageTransports>

  getInitializationOptions? (documentSelector?: vscode.DocumentSelector): LSPAny
}

class CloseOnDisposeWebSocketMessageReader extends WebSocketMessageReader {
  override dispose () {
    super.dispose()
    this.socket.dispose()
  }
}

async function openWebsocketConnection (url: URL | string): Promise<MessageTransports> {
  const webSocket = new WebSocket(url)
  const socket: IWebSocket = toSocket(webSocket)

  const reader = new CloseOnDisposeWebSocketMessageReader(socket)
  const writer = new WebSocketMessageWriter(socket)

  await new Promise((resolve, reject) => {
    webSocket.addEventListener('open', resolve)
    webSocket.addEventListener('error', reject)
  })

  return {
    reader,
    writer
  }
}

export abstract class CodinGameInfrastructure implements Infrastructure {
  constructor (
    /**
     * The domain of the server
     */
    public serverAddress: string,
    private _useMutualizedProxy: boolean,
    /**
     * An optional sessionId when connecting to the session-mutualized server
     */
    private sessionId?: string,
    /**
     * A list of urls which link to zip files containing libraries/resources
     */
    private libraryUrls?: string[]
  ) {
  }

  useMutualizedProxy (languageClientId: LanguageClientId, options: LanguageClientOptions): boolean {
    return this._useMutualizedProxy && options.mutualizable
  }

  public readonly automaticTextDocumentUpdate = false
  public readonly rootUri = 'file:///tmp/project'
  public readonly workspaceFolders: typeof vscode.workspace.workspaceFolders = [{
    uri: monaco.Uri.file('/tmp/project'),
    index: 0,
    name: 'main'
  }]

  public async saveFileContent (document: monaco.Uri, content: string, languageClient: LanguageClientManager): Promise<void> {
    if (languageClient.isConnected()) {
      await updateFile(document.toString(), content, languageClient)
    }
  }

  public async getFileContent (resource: monaco.Uri, languageClient: LanguageClientManager): Promise<string | undefined> {
    try {
      return (await getFile(resource.toString(true), languageClient)).text
    } catch (error) {
      return undefined
    }
  }

  /**
   * A function which returns a valid JWT token to use to connect to the server
   */
  protected abstract getSecurityToken(): Promise<string>

  public async openConnection (id: LanguageClientId): Promise<MessageTransports> {
    try {
      const url = new URL(this.sessionId != null ? `run/${this.sessionId}/${id}` : `run/${id}`, this.serverAddress)
      this.libraryUrls?.forEach(libraryUrl => url.searchParams.append('libraryUrl', libraryUrl))
      url.searchParams.append('token', await this.getSecurityToken())

      const connection = await openWebsocketConnection(url)
      return connection
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Unable to connect to server')
    }
  }

  public getInitializationOptions (documentSelector?: vscode.DocumentSelector): LSPAny {
    // Provide all open model content to the backend so it's able to write them on the disk
    // BEFORE starting the server or registering the workspace folders
    // The didOpen notification already contain the file content but some LSP (like gopls)
    // don't use it and needs the file to be up-to-date on the disk before the workspace folder is added
    let documents = vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'file')
    if (documentSelector != null) {
      documents = documents.filter(doc => vscode.languages.match(documentSelector, doc))
    }
    const files = documents
      .reduce((map, doc) => {
        map[doc.uri.toString(true)] = doc.getText()
        return map
      }, <Record<string, string>>{})
    return {
      files
    }
  }
}
