import {
  ConfigurationChangeEvent, Event, EventEmitter, Disposable, WorkspaceConfiguration
} from 'vscode'
import * as vscode from 'vscode'
import {
  DisposableCollection
} from 'monaco-languageclient'
import * as monaco from 'monaco-editor'

// comes from vscode (vs/workbench/api/common/extHostConfiguration.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lookUp (tree: any, key: string) {
  const parts = key.split('.')
  let node = tree
  for (let i = 0; node != null && i < parts.length; i++) {
    node = node[parts[i]!]
  }
  return node
}

export class MemoryWorkspaceConfiguration implements WorkspaceConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor (config: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thisConfig: any = this
    for (const key of Object.keys(config ?? {})) {
      thisConfig[key] = config[key]
    }
  }

  inspect<T> (): { key: string, defaultValue?: T | undefined, globalValue?: T | undefined, workspaceValue?: T | undefined, workspaceFolderValue?: T | undefined, defaultLanguageValue?: T | undefined, globalLanguageValue?: T | undefined, workspaceLanguageValue?: T | undefined, workspaceFolderLanguageValue?: T | undefined, languageIds?: string[] | undefined } | undefined {
    throw new Error('Method not implemented.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update (): Promise<void> {
    throw new Error('Method not implemented.')
  }

  get<T> (section: string, defaultValue?: T): T {
    return lookUp(this, section) ?? defaultValue
  }

  has (section: string): boolean {
    return section in this
  }
}

const simpleConfigurationService = monaco.extra.StandaloneServices.get(monaco.extra.IConfigurationService) as monaco.extra.StandaloneConfigurationService
class Configuration implements Disposable {
  protected readonly onDidChangeConfigurationEmitter = new EventEmitter<vscode.ConfigurationChangeEvent>()
  private disposableCollection = new DisposableCollection()

  constructor () {
    this.disposableCollection.push(this.onDidChangeConfigurationEmitter)
    this.disposableCollection.push(simpleConfigurationService.onDidChangeConfiguration((event) => {
      this.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration (section) {
          return event.affectsConfiguration(section)
        }
      })
    }))
  }

  getConfiguration (section?: string, resource?: string): MemoryWorkspaceConfiguration {
    return new MemoryWorkspaceConfiguration(this.getValue(section, resource))
  }

  private getValue (section?: string, resource?: string) {
    const override = {
      resource: resource != null ? monaco.Uri.parse(resource) : null
    }
    if (section == null) {
      return simpleConfigurationService.getValue(override)
    }
    return simpleConfigurationService.getValue(section, override)
  }

  get onDidChangeConfiguration (): Event<ConfigurationChangeEvent> {
    return this.onDidChangeConfigurationEmitter.event
  }

  dispose (): void {
    this.disposableCollection.dispose()
  }
}

export default Configuration
