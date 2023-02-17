
import { ExtensionContext } from 'vscode'
import { FeatureState, StaticFeature } from 'vscode-languageclient/lib/browser/main'
import { Disposable, DocumentSelector, ServerCapabilities } from 'vscode-languageserver-protocol'

export function unsupported (): never {
  throw new Error('unsupported')
}

class MultiDisposeError extends Error {
  constructor (public readonly errors: unknown[]) {
    super(`Encountered errors while disposing of store. Errors: [${errors.join(', ')}]`)
  }
}

class SimpleExtensionContext implements ExtensionContext, Disposable {
  subscriptions: Disposable[] = []
  dispose (): void {
    const errors: unknown[] = []
    for (const d of this.subscriptions) {
      try {
        d.dispose()
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length === 1) {
      throw errors[0]
    } else if (errors.length > 1) {
      throw new MultiDisposeError(errors)
    }
  }

  get workspaceState () { return unsupported() }
  get globalState () { return unsupported() }
  get secrets () { return unsupported() }
  get extensionUri () { return unsupported() }
  get extensionPath () { return unsupported() }
  get environmentVariableCollection () { return unsupported() }
  asAbsolutePath = unsupported
  storageUri = undefined
  storagePath = undefined
  get globalStorageUri () { return unsupported() }
  get globalStoragePath () { return unsupported() }
  get logUri () { return unsupported() }
  get logPath () { return unsupported() }
  get extensionMode () { return unsupported() }
  get extension () { return unsupported() }
}

export abstract class ExtensionFeature implements StaticFeature {
  private context = new SimpleExtensionContext()
  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    this.activate(this.context, capabilities, documentSelector)
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  protected abstract activate (context: ExtensionContext, capabilities: ServerCapabilities, documentSelector: DocumentSelector): void

  dispose (): void {
    this.context.dispose()
  }
}
