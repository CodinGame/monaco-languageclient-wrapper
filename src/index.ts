import 'proxy-polyfill'
import './hacks'
import { createLanguageClientManager, StatusChangeEvent } from './languageClient'

export {
  createLanguageClientManager
}

export type {
  StatusChangeEvent
}
