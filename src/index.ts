import 'proxy-polyfill'
import { createLanguageClientManager, LanguageServerConfig, StatusChangeEvent } from './languageClient'

export {
  createLanguageClientManager
}

export type {
  LanguageServerConfig,
  StatusChangeEvent
}
