
import { Services } from 'vscode/services'
import { WorkspaceEdit, Disposable } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { createConverter as createProtocolConverter } from 'vscode-languageclient/lib/common/protocolConverter'
import WatchableConsoleWindow from './services/WatchableConsoleWindow'
import CodinGameMonacoWorkspace from './services/CodinGameMonacoWorkspace'
import { Infrastructure } from './infrastructure'
import CodinGameMonacoEnv from './services/CodinGameMonacoEnv'

interface CgMonacoServices extends Services {
  workspace: CodinGameMonacoWorkspace
  window: WatchableConsoleWindow
}

function installCommands (): Disposable {
  // Comes from https://github.com/redhat-developer/vscode-java/blob/9b0f0aca80cbefabad4c034fb5dd365d029f6170/src/extension.ts#L155-L160
  // Other commands needs to be implemented as well?
  // (https://github.com/eclipse/eclipse.jdt.ls/issues/376#issuecomment-333923685)
  const protocolConverter = createProtocolConverter(undefined, true, true)
  return vscode.commands.registerCommand('java.apply.workspaceEdit', async (obj: WorkspaceEdit) => {
    const edit = await protocolConverter.asWorkspaceEdit(obj)
    return vscode.workspace.applyEdit(edit)
  })
}

const services = {
  workspace: new CodinGameMonacoWorkspace('file:///tmp/project'),
  window: new WatchableConsoleWindow(),
  env: new CodinGameMonacoEnv()
}

Services.install(services)
installCommands()

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
