import { MessageTransports } from 'monaco-languageclient'
import 'proxy-polyfill'
import type { WorkspaceFolder } from 'vscode'
import { CodinGameInfrastructure, Infrastructure } from './infrastructure'
import { WillShutdownParams } from './customRequests'
import { loadExtensionConfigurations } from './extensionConfiguration'
import './hacks'
import { createLanguageClientManager, LanguageClientManager, LanguageClientManagerOptions, StatusChangeEvent } from './languageClient'
import { getLanguageClientOptions, LanguageClientId, LanguageClientOptions, registerLanguageClient } from './languageClientOptions'
import { StaticLanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager,
  registerLanguageClient,
  getLanguageClientOptions,
  LanguageClientManager,
  CodinGameInfrastructure
}

export type {
  StatusChangeEvent,
  StaticLanguageClientId,
  LanguageClientId,
  WillShutdownParams,
  Infrastructure,
  WorkspaceFolder,
  LanguageClientOptions,
  LanguageClientManagerOptions,
  MessageTransports
}
