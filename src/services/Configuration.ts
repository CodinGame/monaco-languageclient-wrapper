import {
  Configurations, ConfigurationChangeEvent, WorkspaceConfiguration, Event, Emitter
} from '@codingame/monaco-languageclient'
import * as monaco from 'monaco-editor'

// comes from vscode (vs/workbench/api/common/extHostConfiguration.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lookUp (tree: any, key: string) {
  const parts = key.split('.')
  let node = tree
  for (let i = 0; node != null && i < parts.length; i++) {
    node = node[parts[i]]
  }
  return node
}

class MemoryWorkspaceConfiguration implements WorkspaceConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor (config: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thisConfig: any = this
    for (const key of Object.keys(config ?? {})) {
      thisConfig[key] = config[key]
    }
  }

  get<T> (section: string, defaultValue?: T) {
    return lookUp(this, section) ?? defaultValue
  }

  has (section: string) {
    return section in this
  }

  toJSON () {
    return this
  }
}

class Configuration implements Configurations {
  protected readonly onDidChangeConfigurationEmitter = new Emitter<ConfigurationChangeEvent>()

  private configurations: Record<string, unknown> = {}

  getConfiguration (section?: string): MemoryWorkspaceConfiguration {
    return new MemoryWorkspaceConfiguration(section != null ? lookUp(this.configurations, section) : this.configurations)
  }

  update (section: string, value: unknown): void {
    monaco.extra.addToValueTree(this.configurations, section, value, e => { throw new Error(e) })

    const event: ConfigurationChangeEvent = {
      affectsConfiguration (eventSection: string): boolean {
        return section === eventSection
      }
    }
    this.onDidChangeConfigurationEmitter.fire(event)
  }

  get onDidChangeConfiguration (): Event<ConfigurationChangeEvent> {
    return this.onDidChangeConfigurationEmitter.event
  }
}

export default Configuration
