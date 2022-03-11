import { ConsoleLogger, createWebSocketConnection, toSocket } from '@codingame/monaco-jsonrpc'
import { MessageConnection, TextDocument, TextDocumentSaveReason } from '@codingame/monaco-languageclient'
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
   * Get a text file content
   * @param resource the Uri of the file
   * @param languageClient The languageclient we're trying to get the file from
   */
  getFileContent (resource: monaco.Uri, languageClient: LanguageClientManager): Promise<string | null>

  /**
   * Open a connection to the language server
   * @param id The language server id
   */
  openConnection (id: LanguageClientId): Promise<MessageConnection>
}
