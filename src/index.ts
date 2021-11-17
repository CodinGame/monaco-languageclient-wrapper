import 'proxy-polyfill'
import './hacks'
import { createLanguageClientManager, LanguageServerConfig, StatusChangeEvent } from './languageClient'

export {
  createLanguageClientManager
}

export type {
  LanguageServerConfig,
  StatusChangeEvent
}
