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
}

export const getTextDocumentRequestType = new ProtocolRequestType<GetTextDocumentParams, GetTextDocumentResult, never, void, void>('textDocument/get')

export function updateFile (uri: string, text: string, languageClient: LanguageClient): Promise<void> {
  return languageClient.sendRequest(saveTextDocumentRequestType, {
    textDocument: {
      uri,
      text
    }
  })
}

export function getFile (uri: string, languageClient: LanguageClient): Promise<{ text: string }> {
  return languageClient.sendRequest(getTextDocumentRequestType, {
    textDocument: {
      uri
    }
  })
}
