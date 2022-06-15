import { monaco, registerTextModelContentProvider } from '@codingame/monaco-editor-wrapper'
import {
  Disposable, MonacoLanguageClient, DisposableCollection
} from 'monaco-languageclient'
import { StaticFeature, FeatureState } from 'vscode-languageclient/lib/common/api'
import { DidSaveTextDocumentNotification, DocumentSelector, Emitter, ServerCapabilities, TextDocumentSyncOptions } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { updateFile, willShutdownNotificationType, WillShutdownParams } from './customRequests'
import { Infrastructure } from './infrastructure'
import { LanguageClient, LanguageClientManager } from './languageClient'
import { getServices } from './services'
import { CobolResolveSubroutineFeature } from './extensions/cobol'

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
    async function saveFile (textDocument: vscode.TextDocument) {
      if (documentSelector != null && vscode.languages.match(documentSelector, textDocument) > 0) {
        await updateFile(textDocument.uri.toString(), textDocument.getText(), languageClient)

        // Always send notification even if the server doesn't support it (because csharp register the didSave feature too late)
        await languageClient.sendNotification(DidSaveTextDocumentNotification.type, {
          textDocument: {
            uri: textDocument.uri.toString()
          },
          text: textDocument.getText()
        })
      }
    }

    this.didOpenTextDocumentDisposable = vscode.workspace.onDidOpenTextDocument(saveFile)
    vscode.workspace.textDocuments.forEach(saveFile)
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
      async saveTextContent (document, reason) {
        if (languageClientManager.isModelManaged(document)) {
          await infrastructure.saveFileContent?.(document, reason, languageClientManager)
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
