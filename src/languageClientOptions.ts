import { Disposable, LanguageClientOptions as MonacoLanguageClientOptions } from 'monaco-languageclient'
import staticOptions, { StaticLanguageClientId } from './staticOptions'

export type LanguageClientOptions = Pick<MonacoLanguageClientOptions, 'documentSelector' | 'synchronize' | 'initializationOptions' | 'middleware'> & {
  vscodeExtensionIds?: string[]
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

export function getLanguageClientOptions (id: LanguageClientId): LanguageClientOptions {
  return dynamicOptions[id] ?? staticOptions[id as StaticLanguageClientId]
}