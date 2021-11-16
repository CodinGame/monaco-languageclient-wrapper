
import * as monaco from 'monaco-editor'
import {
  Services, MonacoToProtocolConverter, ProtocolToMonacoConverter, MonacoLanguages, TextDocumentSaveReason, MonacoCommands, TextDocument
} from '@codingame/monaco-languageclient'
import { RenameFile, CreateFile, WorkspaceEdit } from 'vscode-languageserver-protocol'
import WatchableConsoleWindow from './services/WatchableConsoleWindow'
import CodinGameMonacoWorkspace from './services/CodinGameMonacoWorkspace'

interface CgMonacoServices extends Services {
  commands: MonacoCommands
  languages: MonacoLanguages
  workspace: CodinGameMonacoWorkspace
  window: WatchableConsoleWindow
}

function installCommands (services: CgMonacoServices) {
  // Comes from https://github.com/redhat-developer/vscode-java/blob/9b0f0aca80cbefabad4c034fb5dd365d029f6170/src/extension.ts#L155-L160
  // Other commands needs to be implemented as well?
  // (https://github.com/eclipse/eclipse.jdt.ls/issues/376#issuecomment-333923685)
  services.commands.registerCommand('java.apply.workspaceEdit', (edit: WorkspaceEdit) => {
    if (edit.documentChanges != null && edit.documentChanges.some(change => RenameFile.is(change) || CreateFile.is(change))) {
      alert('Unimplemented command')
      return
    }

    return services.workspace.applyEdit(edit)
  })
}

function autoSaveModels (services: CgMonacoServices) {
  const timeoutMap = new Map<string, number>()
  services.workspace.onDidChangeTextDocument(e => {
    const timeout = timeoutMap.get(e.textDocument.uri)
    if (timeout != null) {
      window.clearTimeout(timeout)
      timeoutMap.delete(e.textDocument.uri)
    }
    timeoutMap.set(e.textDocument.uri, window.setTimeout(() => {
      timeoutMap.delete(e.textDocument.uri)
      services.workspace.saveDocument(e.textDocument, TextDocumentSaveReason.AfterDelay).catch(err => {
        console.error('[LSP]', `Unable to save the document ${e.textDocument.uri.toString()}`, err)
      })
    }, 500))
  })
}

let services: CgMonacoServices | null = null
function installServices (): void {
  const m2p = new MonacoToProtocolConverter(monaco)
  const p2m = new ProtocolToMonacoConverter(monaco)

  if (services == null) {
    services = {
      commands: new MonacoCommands(monaco),
      languages: new MonacoLanguages(monaco, p2m, m2p),
      workspace: new CodinGameMonacoWorkspace(p2m, m2p, 'file:///tmp/project'),
      window: new WatchableConsoleWindow()
    }

    Services.install(services)

    installCommands(services)

    autoSaveModels(services)
  }
}

function updateConfiguration (section: string, value: unknown): void {
  services!.workspace.configurations.update(section, value)
}

async function saveDocument (document: TextDocument, reason: TextDocumentSaveReason): Promise<void> {
  await services!.workspace.saveDocument(document, reason)
}

export {
  installServices,
  saveDocument,
  updateConfiguration
}
