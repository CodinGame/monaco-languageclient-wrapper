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

  private isBlacklisted (resource: monaco.Uri) {
    const REMOTE_FILE_BLACKLIST = ['.git/config', '.vscode', monaco.Uri.parse(this.infrastructure.rootUri).path]

    const blacklisted = REMOTE_FILE_BLACKLIST.some(blacklisted => resource.path.endsWith(blacklisted))
    return blacklisted
  }

  async readFile (resource: monaco.Uri): Promise<Uint8Array> {
    if (this.isBlacklisted(resource)) {
      throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
    }
    try {
      const file = await this.infrastructure.getFileContent!(resource, this.languageClientManager)

      return encoder.encode(file)
    } catch (err) {
      throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.Unknown)
    }
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
    try {
      if (this.isBlacklisted(resource)) {
        throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
      }
      const fileStats = await this.infrastructure.getFileStats?.(resource, this.languageClientManager)
      if (fileStats != null) {
        return {
          type: fileStats.type === 'directory' ? FileType.Directory : FileType.File,
          size: fileStats.size,
          mtime: fileStats.mtime,
          ctime: 0
        }
      }
    } catch (err) {
      throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.Unknown)
    }
    throw FileSystemProviderError.create('file not found', FileSystemProviderErrorCode.FileNotFound)
  }

  async mkdir (): Promise<void> {
  }

  async readdir (resource: monaco.Uri) {
    const result = await this.infrastructure.listFiles?.(resource, this.languageClientManager)
    if (result == null) {
      return []
    }
    return result.map(file => {
      let name = file
      let type = FileType.File
      if (file.endsWith('/')) {
        type = FileType.Directory
        name = file.slice(0, -1)
      }
      return <[string, FileType]>[name, type]
    })
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
