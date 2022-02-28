import { loadConfigurationForExtension } from '@codingame/monaco-editor-wrapper/dist/features/extensionConfigurations'
import { getLanguageClientOptions, LanguageClientId } from './languageClientOptions'

/**
 * Load the configuration schemas from vscode extensions
 * @param forLanguageClientIds Load the extensions related to these language client ids
 * @param useMutualizedProxy The language server proxy is used, so we only need to load configurations for language servers which are not mutualized
 */
export async function loadExtensionConfigurations (forLanguageClientIds: LanguageClientId[], useMutualizedProxy: boolean): Promise<void> {
  const extensionConfigurationToLoad = new Set<string>()
  for (const languageClientId of forLanguageClientIds) {
    const config = getLanguageClientOptions(languageClientId)
    if (!config.mutualizable || !useMutualizedProxy) {
      config.vscodeExtensionIds?.forEach(extensionId => {
        extensionConfigurationToLoad.add(extensionId)
      })
    }
  }

  await Promise.all(Array.from(extensionConfigurationToLoad).map(extensionId => loadConfigurationForExtension(extensionId)))
}
