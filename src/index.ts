import 'proxy-polyfill'
import './hacks'
import { createLanguageClientManager, StatusChangeEvent } from './languageClient'
import { LanguageClientId } from './staticOptions'

export {
  createLanguageClientManager
}

export type {
  StatusChangeEvent,
  LanguageClientId
}
