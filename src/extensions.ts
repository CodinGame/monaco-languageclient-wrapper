import { monaco } from '@codingame/monaco-editor-wrapper'
import {
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  IFileSystemProviderWithFileReadWriteCapability,
  IStat,
  registerFileSystemOverlay
} from '@codingame/monaco-vscode-files-service-override'
import { StaticFeature, FeatureState } from 'vscode-languageclient/lib/common/api'
import {
  DidSaveTextDocumentNotification,
  Disposable,
  DocumentSelector,
  Emitter,
  ServerCapabilities,
  TextDocumentSyncOptions
} from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { IDisposable } from 'monaco-editor'
import { DisposableStore } from '@codingame/monaco-vscode-api/monaco'
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri'
import { MonacoLanguageClient } from './createLanguageClient'
import { LanguageClientManager } from './languageClient'
import { Infrastructure } from './infrastructure'
import { willShutdownNotificationType, WillShutdownParams } from './customRequests'

async function bufferToBase64(buffer: ArrayBuffer | Uint8Array<ArrayBuffer>) {
  // use a FileReader to generate a base64 data URI:
  const base64url = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(new Blob([buffer]))
  })
  // remove the `data:...;base64,` part from the start
  return base64url.slice(base64url.indexOf(',') + 1)
}

async function base64ToBufferAsync(base64: string) {
  const dataUrl = `data:application/octet-binary;base64,${base64}`

  const result = await fetch(dataUrl)
  const buffer = await result.arrayBuffer()
  return new Uint8Array(buffer)
}

interface ResolvedTextDocumentSyncCapabilities {
  resolvedTextDocumentSync?: TextDocumentSyncOptions
}

// Initialize the file content into the lsp server for implementations that don't support open/close notifications
export class InitializeTextDocumentFeature implements StaticFeature {
  private didOpenTextDocumentDisposable: Disposable | undefined
  constructor(
    private languageClient: LanguageClientManager,
    private infrastructure: Infrastructure
  ) {}

  fillClientCapabilities(): void {}

  initialize(
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector | undefined
  ): void {
    const textDocumentSyncOptions = (capabilities as ResolvedTextDocumentSyncCapabilities)
      .resolvedTextDocumentSync
    if (documentSelector == null || (textDocumentSyncOptions?.openClose ?? false)) {
      return
    }

    const infrastructure = this.infrastructure
    const languageClient = this.languageClient
    async function saveFile(textDocument: vscode.TextDocument) {
      if (
        documentSelector != null &&
        vscode.languages.match(documentSelector, textDocument) > 0 &&
        textDocument.uri.scheme === 'file'
      ) {
        await infrastructure.writeFile?.(
          textDocument.uri,
          btoa(textDocument.getText()),
          languageClient
        )

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

  getState(): FeatureState {
    return {
      kind: 'static'
    }
  }

  clear(): void {
    this.didOpenTextDocumentDisposable?.dispose()
  }
}

export class WillDisposeFeature implements StaticFeature {
  constructor(
    private languageClient: MonacoLanguageClient,
    private onWillShutdownEmitter: Emitter<WillShutdownParams>
  ) {}
  fillClientCapabilities(): void {}
  initialize(): void {
    this.languageClient.onNotification(willShutdownNotificationType, (params) => {
      this.onWillShutdownEmitter.fire(params)
    })
  }

  getState(): FeatureState {
    return {
      kind: 'static'
    }
  }

  clear(): void {}
}

class InfrastructureFileSystemUpdaterProvider implements IFileSystemProviderWithFileReadWriteCapability {
  capabilities =
    FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive
  constructor(
    private infrastructure: Infrastructure,
    private languageClientManager: LanguageClientManager
  ) {}

  async readFile(): Promise<Uint8Array> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async writeFile(resource: URI, content: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.infrastructure.writeFile!(
      resource,
      await bufferToBase64(content),
      this.languageClientManager
    )

    throw FileSystemProviderError.create(
      'File written, continue',
      FileSystemProviderErrorCode.FileNotFound
    )
  }

  onDidChangeCapabilities = new vscode.EventEmitter<never>().event
  onDidChangeFile = new vscode.EventEmitter<never>().event
  onDidWatchError = new vscode.EventEmitter<never>().event
  watch(): IDisposable {
    return {
      dispose() {}
    }
  }

  async stat(): Promise<IStat> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async mkdir(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async readdir(): Promise<[string, FileType][]> {
    throw FileSystemProviderError.create('Not found', FileSystemProviderErrorCode.FileNotFound)
  }

  async delete(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async rename(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }
}

class InfrastructureFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {
  capabilities =
    FileSystemProviderCapabilities.FileReadWrite |
    FileSystemProviderCapabilities.PathCaseSensitive |
    FileSystemProviderCapabilities.Readonly
  constructor(
    private infrastructure: Infrastructure,
    private languageClientManager: LanguageClientManager
  ) {}

  private isBlacklisted(resource: monaco.Uri) {
    const REMOTE_FILE_BLACKLIST = [
      '.git/config',
      '.vscode',
      monaco.Uri.parse(this.infrastructure.rootUri).path
    ]

    const blacklisted = REMOTE_FILE_BLACKLIST.some((blacklisted) =>
      resource.path.endsWith(blacklisted)
    )
    return blacklisted
  }

  async readFile(resource: monaco.Uri): Promise<Uint8Array> {
    if (this.isBlacklisted(resource)) {
      throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
    }
    try {
      const file = await this.infrastructure.readFile!(resource, this.languageClientManager)
      return await base64ToBufferAsync(file)
    } catch (err) {
      if ((err as Error).message === 'File not found') {
        throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.FileNotFound)
      }
      throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.Unknown)
    }
  }

  async writeFile(): Promise<void> {
    throw FileSystemProviderError.create('not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  onDidChangeCapabilities = new vscode.EventEmitter<never>().event
  onDidChangeFile = new vscode.EventEmitter<never>().event
  watch(): IDisposable {
    return {
      dispose() {}
    }
  }

  async stat(resource: monaco.Uri): Promise<IStat> {
    try {
      if (this.isBlacklisted(resource)) {
        throw FileSystemProviderError.create(
          'Not allowed',
          FileSystemProviderErrorCode.NoPermissions
        )
      }
      const fileStats = await this.infrastructure.getFileStats?.(
        resource,
        this.languageClientManager
      )
      if (fileStats != null) {
        return {
          type: fileStats.type === 'directory' ? FileType.Directory : FileType.File,
          size: fileStats.size,
          mtime: fileStats.mtime,
          ctime: 0
        }
      }
    } catch (err) {
      if ((err as Error).message === 'File not found') {
        throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.FileNotFound)
      }
      throw FileSystemProviderError.create(err as Error, FileSystemProviderErrorCode.Unknown)
    }
    throw FileSystemProviderError.create('file not found', FileSystemProviderErrorCode.FileNotFound)
  }

  async mkdir(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async readdir(resource: monaco.Uri) {
    const result = await this.infrastructure.listFiles?.(resource, this.languageClientManager)
    if (result == null) {
      return []
    }
    return result.map((file) => {
      let name = file
      let type = FileType.File
      if (file.endsWith('/')) {
        type = FileType.Directory
        name = file.slice(0, -1)
      }
      return <[string, FileType]>[name, type]
    })
  }

  async delete(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }

  async rename(): Promise<void> {
    throw FileSystemProviderError.create('Not allowed', FileSystemProviderErrorCode.NoPermissions)
  }
}

export class FileSystemFeature implements StaticFeature {
  private disposable: Disposable | undefined

  constructor(
    private infrastructure: Infrastructure,
    private languageClientManager: LanguageClientManager
  ) {}

  private registerFileHandlers(): Disposable {
    const disposables = new DisposableStore()

    if (this.infrastructure.readFile != null) {
      // Register a readonly file system overlay to access remote files
      disposables.add(
        registerFileSystemOverlay(
          -1,
          new InfrastructureFileSystemProvider(this.infrastructure, this.languageClientManager)
        )
      )
    }

    if (this.infrastructure.writeFile != null) {
      // register another filesystem to capture file write with a higher priority
      disposables.add(
        registerFileSystemOverlay(
          10,
          new InfrastructureFileSystemUpdaterProvider(
            this.infrastructure,
            this.languageClientManager
          )
        )
      )
    }

    return disposables
  }

  fillClientCapabilities(): void {}

  initialize(): void {
    this.dispose()
    this.disposable = this.registerFileHandlers()
  }

  getState(): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose(): void {
    this.disposable?.dispose()
    this.disposable = undefined
  }

  clear(): void {
    this.dispose()
  }
}
