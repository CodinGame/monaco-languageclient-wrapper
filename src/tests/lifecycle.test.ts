import { whenReady } from '@codingame/monaco-vscode-java-default-extension'
import { initialize } from '@codingame/monaco-editor-wrapper'
import { TestInfrastructure } from './tools'
import { createLanguageClientManager, getLanguageClientOptions } from '..'

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
