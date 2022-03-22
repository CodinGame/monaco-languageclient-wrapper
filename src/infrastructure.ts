import { ConsoleLogger, createWebSocketConnection, toSocket } from '@codingame/monaco-jsonrpc'
import { MessageConnection } from 'vscode-languageserver-protocol'
import { TextDocument, TextDocumentSaveReason } from 'monaco-languageclient'
import * as monaco from 'monaco-editor'
import type * as vscode from 'vscode'
import { getFile, updateFile } from './customRequests'
import { LanguageClientManager } from './languageClient'
import { LanguageClientId } from './languageClientOptions'

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
   * The language server proxy is used, so we only need to load configurations for language servers which are not mutualized
   */
  useMutualizedProxy: boolean

  /**
   * Save a file on the filesystem
   * @param document The document to save
   * @param reason The reason of the save
   * @param languageClient The languageclient we're trying to save the file to
   */
  saveFileContent? (document: TextDocument, reason: TextDocumentSaveReason, languageClient: LanguageClientManager): Promise<void>
  /**
   * Get a text file content as a model
   * @param resource the Uri of the file
   * @param languageClient The languageclient we're trying to get the file from
   */
  getFileContent (resource: monaco.Uri, languageClient: LanguageClientManager): Promise<monaco.editor.ITextModel | null>

  /**
   * Open a connection to the language server
   * @param id The language server id
   */
  openConnection (id: LanguageClientId): Promise<MessageConnection>
}

function openWebsocketConnection (url: URL | string): Promise<MessageConnection> {
  return new Promise<MessageConnection>((resolve, reject) => {
    const webSocket = new WebSocket(url)

    webSocket.onopen = () => {
      const socket = toSocket(webSocket)
      const webSocketConnection = createWebSocketConnection(socket, new ConsoleLogger())
      webSocketConnection.onDispose(() => {
        webSocket.close()
      })

      resolve(webSocketConnection)
    }

    webSocket.onerror = () => {
      reject(new Error('Unable to connect to server'))
    }
  })
}

export abstract class CodinGameInfrastructure implements Infrastructure {
  constructor (
    /**
     * The domain of the server
     */
    public serverAddress: string,
    public useMutualizedProxy: boolean,
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

  public readonly automaticTextDocumentUpdate = false
  public readonly rootUri = 'file:///tmp/project'
  public readonly workspaceFolders: typeof vscode.workspace.workspaceFolders = [{
    uri: monaco.Uri.file('/tmp/project'),
    index: 0,
    name: 'main'
  }]

  public async saveFileContent (document: TextDocument, reason: TextDocumentSaveReason, languageClient: LanguageClientManager): Promise<void> {
    if (languageClient.isConnected()) {
      await updateFile(document.uri.toString(), document.getText(), languageClient)
    }
  }

  public async getFileContent (resource: monaco.Uri, languageClient: LanguageClientManager): Promise<monaco.editor.ITextModel | null> {
    try {
      const content = (await getFile(resource.toString(true), languageClient)).text
      return monaco.editor.createModel(content, undefined, resource)
    } catch (error) {
      console.error('File not found', resource.toString())
      return null
    }
  }

  /**
   * A function which returns a valid JWT token to use to connect to the server
   */
  protected abstract getSecurityToken(): Promise<string>

  public async openConnection (id: LanguageClientId): Promise<MessageConnection> {
    const url = new URL(this.sessionId != null ? `run/${this.sessionId}/${id}` : `run/${id}`, this.serverAddress)
    this.libraryUrls?.forEach(libraryUrl => url.searchParams.append('libraryUrl', libraryUrl))
    url.searchParams.append('token', await this.getSecurityToken())

    const connection = await openWebsocketConnection(url)
    return connection
  }
}
