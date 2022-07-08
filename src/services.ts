
import { Services } from 'vscode/services'
import PopupConsoleWindow from './services/PopupConsoleWindow'
import CodinGameMonacoWorkspace from './services/CodinGameMonacoWorkspace'
import { Infrastructure } from './infrastructure'

interface CgMonacoServices extends Services {
  workspace: CodinGameMonacoWorkspace
  window: PopupConsoleWindow
}

const services: CgMonacoServices = {
  workspace: new CodinGameMonacoWorkspace('file:///tmp/project'),
  window: new PopupConsoleWindow()
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
