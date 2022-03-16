import 'proxy-polyfill'
import { WorkspaceFolder } from 'vscode'
import { WillShutdownParams } from './customRequests'
import { loadExtensionConfigurations } from './extensionConfiguration'
import './hacks'
import { CodinGameInfrastructure, Infrastructure } from './infrastructure'
import { createLanguageClientManager, LanguageClientManager, StatusChangeEvent } from './languageClient'
import { LanguageClientId, registerLanguageClient } from './languageClientOptions'
import { StaticLanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager,
  registerLanguageClient,
  LanguageClientManager,
  CodinGameInfrastructure
}

export type {
  StatusChangeEvent,
  StaticLanguageClientId,
  LanguageClientId,
  WillShutdownParams,
  Infrastructure,
  WorkspaceFolder
}
