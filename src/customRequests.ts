import { LanguageClient } from './languageClient'

export function updateFile (uri: string, text: string, languageClient: LanguageClient): Promise<void> {
  return languageClient.sendRequest('textDocument/save', {
    textDocument: {
      uri,
      text
    }
  })
}

export function getFile (uri: string, languageClient: LanguageClient): Promise<{ text: string }> {
  return languageClient.sendRequest('textDocument/get', {
    textDocument: {
      uri
    }
  })
}
