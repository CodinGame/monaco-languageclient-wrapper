import { ProtocolNotificationType, ProtocolRequestType } from 'vscode-languageserver-protocol'
import { LanguageClient } from './languageClient'

export interface WillShutdownParams {
  delay: number
}
export const willShutdownNotificationType = new ProtocolNotificationType<WillShutdownParams, void>('willShutdown')

export interface SaveTextDocumentParams {
  textDocument: {
    uri: string
    text: string
  }
}

export const saveTextDocumentRequestType = new ProtocolRequestType<SaveTextDocumentParams, void, never, void, void>('textDocument/save')

export interface GetTextDocumentParams {
  textDocument: {
    uri: string
  }
}

export interface GetTextDocumentResult {
  text: string
  mtime?: number
}

export const getTextDocumentRequestType = new ProtocolRequestType<GetTextDocumentParams, GetTextDocumentResult, never, void, void>('textDocument/get')

export interface StatFileParams {
  uri: string
}
export interface StatFileResult {
  type: 'directory' | 'file'
  size: number
  name: string
  mtime: number
}

export const getFileStatsRequestType = new ProtocolRequestType<StatFileParams, StatFileResult, never, void, void>('file/stats')

export interface ListFilesParams {
  directory: string
}
export interface ListFilesResult {
  files: string[]
}

export const listFileRequestType = new ProtocolRequestType<ListFilesParams, ListFilesResult, never, void, void>('file/list')

export function updateFile (uri: string, text: string, languageClient: LanguageClient): Promise<void> {
  return languageClient.sendRequest(saveTextDocumentRequestType, {
    textDocument: {
      uri,
      text
    }
  })
}

export function getFileContent (uri: string, languageClient: LanguageClient): Promise<GetTextDocumentResult> {
  return languageClient.sendRequest(getTextDocumentRequestType, {
    textDocument: {
      uri
    }
  })
}

export function getFileStats (uri: string, languageClient: LanguageClient): Promise<StatFileResult> {
  return languageClient.sendRequest(getFileStatsRequestType, {
    uri
  })
}

export function listFiles (directory: string, languageClient: LanguageClient): Promise<ListFilesResult> {
  return languageClient.sendRequest(listFileRequestType, {
    directory
  })
}
