import { MessageTransports } from 'vscode-languageclient'
import type { WorkspaceFolder } from 'vscode'
import { CodinGameInfrastructure, Infrastructure } from './infrastructure'
import { WillShutdownParams } from './customRequests'
import { loadExtensionConfigurations } from './extensionConfiguration'
import './hacks'
import {
  createLanguageClientManager,
  LanguageClientManager,
  LanguageClientManagerOptions,
  StatusChangeEvent
} from './languageClient'
import {
  getLanguageClientOptions,
  LanguageClientId,
  LanguageClientOptions,
  registerLanguageClient
} from './languageClientOptions'
import defaultLanguageClientOptions, { StaticLanguageClientId } from './staticOptions'

export {
  loadExtensionConfigurations,
  createLanguageClientManager,
  registerLanguageClient,
  getLanguageClientOptions,
  LanguageClientManager,
  CodinGameInfrastructure,
  defaultLanguageClientOptions
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
