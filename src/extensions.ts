import {
  Disposable,
  ServerCapabilities, DocumentSelector, MonacoLanguageClient, StaticFeature, Services,
  TextDocumentSyncOptions, TextDocument, DidSaveTextDocumentNotification, Emitter, ProtocolNotificationType
} from '@codingame/monaco-languageclient'
import { updateFile, willShutdownNotificationType, WillShutdownParams } from './customRequests'

interface ResolvedTextDocumentSyncCapabilities {
  resolvedTextDocumentSync?: TextDocumentSyncOptions
}

// Initialize the file content into the lsp server for implementations that don't support open/close notifications
class InitializeTextDocumentFeature implements StaticFeature {
  private didOpenTextDocumentDisposable: Disposable | undefined
  constructor (private languageClient: MonacoLanguageClient) {}

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

        // send save notification if there is the capability
        if (
          textDocumentSyncOptions != null &&
          textDocumentSyncOptions.save != null &&
          (typeof textDocumentSyncOptions.save !== 'boolean' || textDocumentSyncOptions.save)
        ) {
          const includeText: boolean = typeof textDocumentSyncOptions.save === 'boolean' ? false : (textDocumentSyncOptions.save.includeText ?? false)

          languageClient.sendNotification(DidSaveTextDocumentNotification.type, {
            textDocument: {
              uri: textDocument.uri
            },
            text: includeText ? textDocument.getText() : undefined
          })
        }
      }
    }

    this.didOpenTextDocumentDisposable = Services.get().workspace.onDidOpenTextDocument(saveFile)
    Services.get().workspace.textDocuments.forEach(saveFile)
  }

  dispose (): void {
    this.didOpenTextDocumentDisposable?.dispose()
  }
}

class CobolResolveSubroutineFeature implements StaticFeature {
  private onRequestDisposable: Disposable | undefined
  constructor (private languageClient: MonacoLanguageClient) {
  }

  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    this.onRequestDisposable = this.languageClient.onRequest('cobol/resolveSubroutine', (routineName: string) => {
      const constantRoutinePaths: Partial<Record<string, string>> = {
        'assert-equals': 'file:/tmp/project/deps/assert-equals.cbl'
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

  dispose (): void {
    this.onRequestDisposable?.dispose()
  }
}

export function registerExtensionFeatures (client: MonacoLanguageClient, language: string): void {
  client.registerFeature(new InitializeTextDocumentFeature(client))
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

  dispose (): void {}
}
