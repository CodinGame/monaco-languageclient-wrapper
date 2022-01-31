import 'proxy-polyfill'
import { loadExtensionConfigurations } from './extensionConfiguration'
import './hacks'
import { createLanguageClientManager, StatusChangeEvent } from './languageClient'
import { LanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager
}

export type {
  StatusChangeEvent,
  LanguageClientId
}
