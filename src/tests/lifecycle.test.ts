import { whenReady } from '@codingame/monaco-vscode-java-default-extension'
import { initialize } from '@codingame/monaco-editor-wrapper'
import '@codingame/monaco-editor-wrapper/features/configuration'
import '@codingame/monaco-editor-wrapper/features/dialogs'
import { TestInfrastructure } from './tools'
import { createLanguageClientManager, getLanguageClientOptions } from '..'
import { beforeAll, describe, test } from '@jest/globals'

beforeAll(async () => {
  await initialize()
})

describe('Lifecycle', () => {
  test('Can dispose the language client manager immediately', async () => {
    const infrastructure = new TestInfrastructure(false, false, 2000)
    await whenReady()

    const languageClient = createLanguageClientManager('java', infrastructure, {
      ...getLanguageClientOptions('java'),
      createAdditionalFeatures: undefined
    })
    const startPromise = languageClient.start()
    await languageClient.dispose()
    await startPromise
  })
})
