import {
  Configurations, ConfigurationChangeEvent, WorkspaceConfiguration, Event, Emitter
} from 'monaco-languageclient'
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

const simpleConfigurationService = monaco.extra.StandaloneServices.get(monaco.extra.IConfigurationService) as monaco.extra.StandaloneConfigurationService
class Configuration implements Configurations {
  protected readonly onDidChangeConfigurationEmitter = new Emitter<ConfigurationChangeEvent>()

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
    return simpleConfigurationService.onDidChangeConfiguration
  }
}

export default Configuration
