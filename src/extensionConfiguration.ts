import { loadConfigurationForExtension } from '@codingame/monaco-editor-wrapper/dist/features/extensionConfigurations'
import staticOptions, { LanguageClientId } from './staticOptions'

export async function loadExtensionConfigurations (forLanguageClientIds: LanguageClientId[], nonMutualizableOnly: boolean): Promise<void> {
  const extensionConfigurationToLoad = new Set<string>()
  for (const languageClientId of forLanguageClientIds) {
    const config = staticOptions[languageClientId]
    if (!config.mutualizable || !nonMutualizableOnly) {
      (config.vscodeExtensionIds ?? []).forEach(extensionId => {
        extensionConfigurationToLoad.add(extensionId)
      })
    }
  }

  await Promise.all(Array.from(extensionConfigurationToLoad).map(extensionId => loadConfigurationForExtension(extensionId)))
}
