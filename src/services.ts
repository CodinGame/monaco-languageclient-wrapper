
import { Services } from 'vscode/services'
import WatchableConsoleWindow from './services/WatchableConsoleWindow'
import CodinGameMonacoWorkspace from './services/CodinGameMonacoWorkspace'
import { Infrastructure } from './infrastructure'
import CodinGameMonacoEnv from './services/CodinGameMonacoEnv'

interface CgMonacoServices extends Services {
  workspace: CodinGameMonacoWorkspace
  window: WatchableConsoleWindow
}

const services: CgMonacoServices = {
  workspace: new CodinGameMonacoWorkspace('file:///tmp/project'),
  window: new WatchableConsoleWindow()
}

Services.install(services)

function updateServices (infrastructure: Infrastructure): void {
  services.workspace.initialize(
    infrastructure.rootUri,
    infrastructure.workspaceFolders,
    !infrastructure.automaticTextDocumentUpdate
  )
}

function getServices (): CgMonacoServices {
  return Services.get()! as CgMonacoServices
}

export {
  updateServices,
  getServices
}
