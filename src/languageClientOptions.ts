import { Disposable, LanguageClientOptions as MonacoLanguageClientOptions } from 'monaco-languageclient'
import staticOptions, { StaticLanguageClientId } from './staticOptions'

export type LanguageClientOptions = Pick<MonacoLanguageClientOptions, 'documentSelector' | 'synchronize' | 'initializationOptions' | 'middleware'> & {
  vscodeExtensionIds?: string[]
  mutualizable: boolean
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
