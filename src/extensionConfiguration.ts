import { registerDefaultConfigurations } from '@codingame/monaco-editor-wrapper'
import { LanguageClientOptions } from './languageClientOptions'

/**
 * Load the configuration schemas from vscode extensions
 * @param forLanguageClientIds Load the extensions related to these language client ids
 */
export async function loadExtensionConfigurations(
  clientOptions: LanguageClientOptions[]
): Promise<void> {
  registerDefaultConfigurations(
    clientOptions
      .map((clientOption) => clientOption.defaultConfigurationOverride)
      .filter(<T>(v: T): v is Exclude<T, null | undefined> => v != null)
  )
}
