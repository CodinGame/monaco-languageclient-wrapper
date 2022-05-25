import { monaco, registerTextModelContentProvider } from '@codingame/monaco-editor-wrapper'
import {
  Disposable,
  ServerCapabilities, DocumentSelector, MonacoLanguageClient, Services,
  TextDocumentSyncOptions, TextDocument, DidSaveTextDocumentNotification, Emitter, DisposableCollection
} from 'monaco-languageclient'
import { StaticFeature, FeatureState, ProtocolRequestType } from 'vscode-languageclient/lib/common/api'
import { updateFile, willShutdownNotificationType, WillShutdownParams } from './customRequests'
import { Infrastructure } from './infrastructure'
import { LanguageClient, LanguageClientManager } from './languageClient'
import { getServices } from './services'

interface ResolvedTextDocumentSyncCapabilities {
  resolvedTextDocumentSync?: TextDocumentSyncOptions
}

// Initialize the file content into the lsp server for implementations that don't support open/close notifications
export class InitializeTextDocumentFeature implements StaticFeature {
  private didOpenTextDocumentDisposable: Disposable | undefined
  constructor (private languageClient: LanguageClient) {}

  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
    const textDocumentSyncOptions = (capabilities as ResolvedTextDocumentSyncCapabilities).resolvedTextDocumentSync
    if (documentSelector == null || (textDocumentSyncOptions?.openClose ?? false)) {
      return
    }

    const languageClient = this.languageClient
    async function saveFile (textDocument: TextDocument) {
      if (Services.get().languages.match(documentSelector!, textDocument)) {
        await updateFile(textDocument.uri, textDocument.getText(), languageClient)

        // Always send notification even if the server doesn't support it (because csharp register the didSave feature too late)
        languageClient.sendNotification(DidSaveTextDocumentNotification.type, {
          textDocument: {
            uri: textDocument.uri
          },
          text: textDocument.getText()
        })
      }
    }

    this.didOpenTextDocumentDisposable = Services.get().workspace.onDidOpenTextDocument(saveFile)
    Services.get().workspace.textDocuments.forEach(saveFile)
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose (): void {
    this.didOpenTextDocumentDisposable?.dispose()
  }
}

export const ResolveCobolSubroutineRequestType = new ProtocolRequestType<string, string, never, void, void>('cobol/resolveSubroutine')
class CobolResolveSubroutineFeature implements StaticFeature {
  private onRequestDisposable: Disposable | undefined
  constructor (private languageClient: MonacoLanguageClient) {
  }

  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    this.onRequestDisposable = this.languageClient.onRequest(ResolveCobolSubroutineRequestType, (routineName: string) => {
      const constantRoutinePaths: Partial<Record<string, string>> = {
        'assert-equals': `${Services.get().workspace.rootUri ?? 'file:/tmp/project'}/deps/assert-equals.cbl`
      }
      const contantRoutinePath = constantRoutinePaths[routineName.toLowerCase()]
      if (contantRoutinePath != null) {
        return contantRoutinePath
      }
      return Services.get().workspace.textDocuments
        .filter(textDocument => Services.get().languages.match(documentSelector, textDocument))
        .filter(document => document.getText().match(new RegExp(`PROGRAM-ID\\.\\W+${routineName}\\.`, 'gi')))
        .sort((a, b) => a.uri.localeCompare(b.uri))[0]?.uri
    })
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose (): void {
    this.onRequestDisposable?.dispose()
  }
}

export function registerExtensionFeatures (client: MonacoLanguageClient, language: string): void {
  if (language === 'cobol') {
    client.registerFeature(new CobolResolveSubroutineFeature(client))
  }
}

export class WillDisposeFeature implements StaticFeature {
  constructor (private languageClient: MonacoLanguageClient, private onWillShutdownEmitter: Emitter<WillShutdownParams>) {}
  fillClientCapabilities (): void {}
  initialize (): void {
    this.languageClient.onNotification(willShutdownNotificationType, (params) => {
      this.onWillShutdownEmitter.fire(params)
    })
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose (): void {}
}

export class FileSystemFeature implements StaticFeature {
  private disposable: Disposable | undefined

  constructor (private infrastructure: Infrastructure, private languageClientManager: LanguageClientManager) {}

  private registerFileHandlers (): Disposable {
    const disposableCollection = new DisposableCollection()
    const infrastructure = this.infrastructure
    const languageClientManager = this.languageClientManager
    disposableCollection.push(registerTextModelContentProvider('file', {
      async provideTextContent (resource: monaco.Uri): Promise<monaco.editor.ITextModel | null> {
        return await infrastructure.getFileContent(resource, languageClientManager)
      }
    }))
    disposableCollection.push(getServices().workspace.registerSaveDocumentHandler({
      async saveTextContent (textDocument, reason) {
        if (languageClientManager.isModelManaged(textDocument)) {
          await infrastructure.saveFileContent?.(textDocument, reason, languageClientManager)
        }
      }
    }))
    return disposableCollection
  }

  fillClientCapabilities (): void {}

  initialize (): void {
    this.dispose()
    this.disposable = this.registerFileHandlers()
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose (): void {
    this.disposable?.dispose()
    this.disposable = undefined
  }
}
