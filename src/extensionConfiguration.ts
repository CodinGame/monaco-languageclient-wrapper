import { loadConfigurationForExtension } from '@codingame/monaco-editor-wrapper/features/extensionConfigurations'
import { registerDefaultConfigurations } from '@codingame/monaco-editor-wrapper'
import { LanguageClientOptions } from './languageClientOptions'

/**
 * Load the configuration schemas from vscode extensions
 * @param forLanguageClientIds Load the extensions related to these language client ids
 * @param useMutualizedProxy The language server proxy is used, so we only need to load configurations for language servers which are not mutualized
 */
export async function loadExtensionConfigurations (clientOptions: LanguageClientOptions[], useMutualizedProxy: boolean): Promise<void> {
  const extensionConfigurationToLoad = new Set<string>()
  for (const clientOption of clientOptions) {
    if (!clientOption.mutualizable || !useMutualizedProxy) {
      clientOption.vscodeExtensionIds?.forEach(extensionId => {
        extensionConfigurationToLoad.add(extensionId)
      })
    }
  }

  await Promise.all(Array.from(extensionConfigurationToLoad).map(extensionId => loadConfigurationForExtension(extensionId)))

  registerDefaultConfigurations(clientOptions.map(clientOption => clientOption.defaultConfigurationOverride).filter(<T> (v: T): v is Exclude<T, null | undefined> => v != null))
}
