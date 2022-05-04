
import * as monaco from 'monaco-editor'
import {
  Services, MonacoToProtocolConverter, ProtocolToMonacoConverter, MonacoLanguages, MonacoCommands
} from 'monaco-languageclient'
import { RenameFile, CreateFile, WorkspaceEdit, Disposable } from 'vscode-languageserver-protocol'
import WatchableConsoleWindow from './services/WatchableConsoleWindow'
import CodinGameMonacoWorkspace from './services/CodinGameMonacoWorkspace'
import { Infrastructure } from './infrastructure'

interface CgMonacoServices extends Services {
  commands: MonacoCommands
  languages: MonacoLanguages
  workspace: CodinGameMonacoWorkspace
  window: WatchableConsoleWindow
}

function installCommands (services: CgMonacoServices): Disposable {
  // Comes from https://github.com/redhat-developer/vscode-java/blob/9b0f0aca80cbefabad4c034fb5dd365d029f6170/src/extension.ts#L155-L160
  // Other commands needs to be implemented as well?
  // (https://github.com/eclipse/eclipse.jdt.ls/issues/376#issuecomment-333923685)
  return services.commands.registerCommand('java.apply.workspaceEdit', (edit: WorkspaceEdit) => {
    if (edit.documentChanges != null && edit.documentChanges.some(change => RenameFile.is(change) || CreateFile.is(change))) {
      alert('Unimplemented command')
      return
    }

    return services.workspace.applyEdit(edit)
  })
}

const m2p = new MonacoToProtocolConverter(monaco)
const p2m = new ProtocolToMonacoConverter(monaco)
const services = {
  commands: new MonacoCommands(monaco),
  languages: new MonacoLanguages(monaco, p2m, m2p),
  workspace: new CodinGameMonacoWorkspace(p2m, m2p, 'file:///tmp/project'),
  window: new WatchableConsoleWindow()
}

installCommands(services)
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
