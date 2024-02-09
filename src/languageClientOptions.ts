import { LanguageClientOptions as BaseLanguageClientOptions } from 'vscode-languageclient'
import { StaticFeature, DynamicFeature } from 'vscode-languageclient/lib/common/api'
import { Disposable } from 'vscode-languageserver-protocol'
import staticOptions, { StaticLanguageClientId } from './staticOptions'
import { MonacoLanguageClient } from './createLanguageClient'

export type LanguageClientOptions = Pick<BaseLanguageClientOptions, 'documentSelector' | 'synchronize' | 'initializationOptions' | 'middleware' | 'errorHandler'> & {
  defaultConfigurationOverride?: Record<string, unknown>
  /**
   * Is this language server mutualizable by the CodinGame mutualized proxy
   */
  mutualizable: boolean
  /**
   * Maximum initialization duration. After this delay, the language server will be considered ready no matter what
   * default: 15_000
   */
  maxInitializeDuration?: number

  /**
   * The language server will only be considered ready after this log message was received
   */
  readinessMessageMatcher?: RegExp

  createAdditionalFeatures?(client: MonacoLanguageClient): Promise<(StaticFeature | DynamicFeature<unknown>)[]>
}

const dynamicOptions: Partial<Record<string, LanguageClientOptions>> = {}

export function registerLanguageClient (id: string, options: LanguageClientOptions): Disposable {
  dynamicOptions[id] = options

  return Disposable.create(() => {
    if (dynamicOptions[id] === options) {
      delete dynamicOptions[id]
    }
  })
}

export type LanguageClientId = StaticLanguageClientId | string

export function getLanguageClientOptions (id: StaticLanguageClientId): LanguageClientOptions
export function getLanguageClientOptions (id: string): LanguageClientOptions | undefined
export function getLanguageClientOptions (id: LanguageClientId): LanguageClientOptions | undefined {
  return dynamicOptions[id] ?? staticOptions[id as StaticLanguageClientId]
}
