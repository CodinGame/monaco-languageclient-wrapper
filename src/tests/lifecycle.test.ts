
import { TestInfrastructure } from './tools'
import { createLanguageClientManager, getLanguageClientOptions } from '..'

describe('Lifecycle', () => {
  test('Can dispose the language client manager immediately', async () => {
    const infrastructure = new TestInfrastructure(false, false, 2000)

    const languageClient = createLanguageClientManager('java', infrastructure, {
      ...getLanguageClientOptions('java'),
      createAdditionalFeatures: undefined
    })
    const startPromise = languageClient.start()
    await languageClient.dispose()
    await startPromise
  })
})
