import 'proxy-polyfill'
import { loadExtensionConfigurations } from './extensionConfiguration'
import { WillShutdownParams } from './extensions'
import './hacks'
import { createLanguageClientManager, LanguageClientManager, StatusChangeEvent } from './languageClient'
import { LanguageClientId, registerLanguageClient } from './languageClientOptions'
import { StaticLanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager,
  registerLanguageClient,
  LanguageClientManager
}

export type {
  StatusChangeEvent,
  StaticLanguageClientId,
  LanguageClientId,
  WillShutdownParams
}
