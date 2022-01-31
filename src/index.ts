import 'proxy-polyfill'
import { loadExtensionConfigurations } from './extensionConfiguration'
import { WillShutdownParams } from './extensions'
import './hacks'
import { createLanguageClientManager, LanguageClientManager, StatusChangeEvent } from './languageClient'
import { LanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager,
  LanguageClientManager
}

export type {
  StatusChangeEvent,
  LanguageClientId,
  WillShutdownParams
}
