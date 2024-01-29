import { monaco } from '@codingame/monaco-editor-wrapper'
import { FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileSystemProviderWithFileReadWriteCapability, IStat, registerFileSystemOverlay } from '@codingame/monaco-vscode-files-service-override'
import { StaticFeature, FeatureState } from 'vscode-languageclient/lib/common/api'
import { DidSaveTextDocumentNotification, Disposable, DocumentSelector, Emitter, ServerCapabilities, TextDocumentSyncOptions } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { IDisposable } from 'monaco-editor'
import { DisposableStore } from 'vscode/monaco'
import { willShutdownNotificationType, WillShutdownParams } from './customRequests'
import { Infrastructure } from './infrastructure'
import { LanguageClientManager } from './languageClient'
import { MonacoLanguageClient } from './createLanguageClient'

interface ResolvedTextDocumentSyncCapabilities {
  resolvedTextDocumentSync?: TextDocumentSyncOptions
}

// Initialize the file content into the lsp server for implementations that don't support open/close notifications
export class InitializeTextDocumentFeature implements StaticFeature {
  private didOpenTextDocumentDisposable: Disposable | undefined
  constructor (private languageClient: LanguageClientManager, private infrastructure: Infrastructure) {}

  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
    const textDocumentSyncOptions = (capabilities as ResolvedTextDocumentSyncCapabilities).resolvedTextDocumentSync
    if (documentSelector == null || (textDocumentSyncOptions?.openClose ?? false)) {
      return
    }

    const infrastructure = this.infrastructure
    const languageClient = this.languageClient
    async function saveFile (textDocument: vscode.TextDocument) {
      if (documentSelector != null && vscode.languages.match(documentSelector, textDocument) > 0 && textDocument.uri.scheme === 'file') {
        await infrastructure.saveFileContent?.(textDocument.uri, textDocument.getText(), languageClient)

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

  clear (): void {
    this.didOpenTextDocumentDisposable?.dispose()
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

  clear (): void {}
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
class InfrastructureTextFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {
  capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.Readonly
  constructor (private infrastructure: Infrastructure, private languageClientManager: LanguageClientManager) {
  }

  private cachedContent: Map<string, Promise<string | undefined>> = new Map()
  private async getFileContent (resource: monaco.Uri): Promise<string | undefined> {
    if (!this.cachedContent.has(resource.toString()) && resource.toString().includes('.')) {
      this.cachedContent.set(resource.toString(), this.infrastructure.getFileContent!(resource, this.languageClientManager))
    }
    return await this.cachedContent.get(resource.toString())
  }

  async readFile (resource: monaco.Uri): Promise<Uint8Array> {
    if (!resource.toString().startsWith(this.infrastructure.rootUri)) {
      throw FileSystemProviderError.create('file not found', FileSystemProviderErrorCode.FileNotFound)
    }
    const content = await this.getFileContent(resource)
    return encoder.encode(content)
  }

  async writeFile (): Promise<void> {
    throw FileSystemProviderError.create('not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  onDidChangeCapabilities = new vscode.EventEmitter<never>().event
  onDidChangeFile = new vscode.EventEmitter<never>().event
  watch (): IDisposable {
    return {
      dispose () {}
    }
  }

  async stat (resource: monaco.Uri): Promise<IStat> {
    if (!resource.toString().startsWith(this.infrastructure.rootUri)) {
      throw FileSystemProviderError.create('file not found', FileSystemProviderErrorCode.FileNotFound)
    }
    try {
      const content = await this.getFileContent(resource)
      if (content != null) {
        return {
          type: FileType.File,
          size: encoder.encode(content).length,
          mtime: Date.now(),
          ctime: Date.now()
        }
      }
    } catch (err) {
      throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.Unknown)
    }
    throw FileSystemProviderError.create('file not found', FileSystemProviderErrorCode.FileNotFound)
  }

  async mkdir (): Promise<void> {
  }

  async readdir () {
    return []
  }

  delete (): Promise<void> {
    throw new Error('Method not implemented.')
  }

  rename (): Promise<void> {
    throw new Error('Method not implemented.')
  }
}

export class FileSystemFeature implements StaticFeature {
  private disposable: Disposable | undefined

  constructor (private infrastructure: Infrastructure, private languageClientManager: LanguageClientManager) {}

  private registerFileHandlers (): Disposable {
    const disposables = new DisposableStore()

    // Register readonly file system overlay to access remote files
    if (this.infrastructure.getFileContent != null) {
      disposables.add(registerFileSystemOverlay(-1, new InfrastructureTextFileSystemProvider(this.infrastructure, this.languageClientManager)))
    }

    if (this.infrastructure.saveFileContent != null) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.parse(this.infrastructure.rootUri), '**/*'))
      disposables.add(watcher)
      const onFileChange = async (uri: vscode.Uri) => {
        if ((await vscode.workspace.fs.stat(uri)).type === vscode.FileType.File) {
          const content = await vscode.workspace.fs.readFile(uri)
          await this.infrastructure.saveFileContent?.(uri, decoder.decode(content), this.languageClientManager)
        }
      }
      watcher.onDidChange(onFileChange)
      watcher.onDidCreate(onFileChange)
    }

    return disposables
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

  clear (): void {
    this.dispose()
  }
}
