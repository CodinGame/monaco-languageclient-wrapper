
import * as monaco from 'monaco-editor'
import {
  Services, MonacoToProtocolConverter, ProtocolToMonacoConverter, MonacoLanguages, TextDocumentSaveReason, MonacoCommands, DisposableCollection
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

function autoSaveModels (services: CgMonacoServices): Disposable {
  const disposableCollection = new DisposableCollection()
  const timeoutMap = new Map<string, number>()
  disposableCollection.push(services.workspace.onDidChangeTextDocument(e => {
    const timeout = timeoutMap.get(e.textDocument.uri)
    if (timeout != null) {
      window.clearTimeout(timeout)
      timeoutMap.delete(e.textDocument.uri)
    }
    timeoutMap.set(e.textDocument.uri, window.setTimeout(() => {
      timeoutMap.delete(e.textDocument.uri)
      services.workspace.saveDocument(e.textDocument, TextDocumentSaveReason.AfterDelay).catch((error: Error) => {
        monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Unable to save the document ${e.textDocument.uri.toString()}`, {
          cause: error
        }))
      })
    }, 500))
  }))
  disposableCollection.push(Disposable.create(() => {
    for (const timeout of Array.from(timeoutMap.values())) {
      window.clearTimeout(timeout)
    }
  }))
  return disposableCollection
}

let serviceDisposable: Disposable | null = null
let serviceReferenceCount = 0
function installServices (infrastructure: Infrastructure): Disposable {
  if (serviceReferenceCount === 0) {
    const disposableCollection = new DisposableCollection()

    const m2p = new MonacoToProtocolConverter(monaco)
    const p2m = new ProtocolToMonacoConverter(monaco)
    const services = {
      commands: new MonacoCommands(monaco),
      languages: new MonacoLanguages(monaco, p2m, m2p),
      workspace: new CodinGameMonacoWorkspace(p2m, m2p, infrastructure.rootUri, infrastructure.workspaceFolders),
      window: new WatchableConsoleWindow()
    }

    disposableCollection.push(services.workspace)
    disposableCollection.push(installCommands(services))
    disposableCollection.push(Services.install(services))

    if (!infrastructure.automaticTextDocumentUpdate) {
      disposableCollection.push(autoSaveModels(services))
    }
    serviceDisposable = disposableCollection
  }
  serviceReferenceCount++

  return Disposable.create(() => {
    serviceReferenceCount--
    if (serviceReferenceCount <= 0) {
      serviceDisposable?.dispose()
      serviceDisposable = null
    }
  })
}

function getServices (): CgMonacoServices {
  return Services.get()! as CgMonacoServices
}

export {
  installServices,
  getServices
}
