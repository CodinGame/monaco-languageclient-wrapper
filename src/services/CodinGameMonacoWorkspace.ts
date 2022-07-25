import {
  Disposable, DisposableCollection
} from 'monaco-languageclient'
import * as monaco from 'monaco-editor'
import * as vscode from 'vscode'
import { Workspace } from 'vscode/services'
import { Event, Emitter, TextDocumentSaveReason } from 'vscode-languageserver-protocol'

export interface ITextModelContentSaveHandler {
  saveTextContent(document: vscode.TextDocument, reason: TextDocumentSaveReason): Promise<void>
}

export default class CodinGameMonacoWorkspace implements Workspace {
  protected readonly onWillSaveTextDocumentEmitter = new Emitter<vscode.TextDocumentWillSaveEvent>()
  private readonly savehandlers: ITextModelContentSaveHandler[] = []
  protected readonly onDidSaveTextDocumentEmitter = new Emitter<vscode.TextDocument>()

  private autoSaveModelDisposable: Disposable | undefined

  public workspaceFolders: typeof vscode.workspace.workspaceFolders

  constructor (
    public readonly rootUri: string | null = null
  ) {
  }

  public initialize (
    rootUri: string | null = null,
    workspaceFolders: typeof vscode.workspace.workspaceFolders,
    autoSaveModels: boolean
  ): void {
    if (workspaceFolders != null) {
      this.workspaceFolders = workspaceFolders
    } else if (rootUri != null) {
      const uri = monaco.Uri.parse(rootUri)
      this.workspaceFolders = [{
        uri,
        index: 0,
        name: uri.toString()
      }]
    }
    if (autoSaveModels && this.autoSaveModelDisposable == null) {
      this.autoSaveModelDisposable = this.autoSaveModels()
    } else if (!autoSaveModels && this.autoSaveModelDisposable != null) {
      this.autoSaveModelDisposable.dispose()
      this.autoSaveModelDisposable = undefined
    }
  }

  get onWillSaveTextDocument (): Event<vscode.TextDocumentWillSaveEvent> {
    return this.onWillSaveTextDocumentEmitter.event
  }

  get onDidSaveTextDocument (): Event<vscode.TextDocument> {
    return this.onDidSaveTextDocumentEmitter.event
  }

  registerSaveDocumentHandler (handler: ITextModelContentSaveHandler): Disposable {
    this.savehandlers.push(handler)
    return Disposable.create(() => {
      const index = this.savehandlers.indexOf(handler)
      if (index >= 0) {
        this.savehandlers.splice(index, 1)
      }
    })
  }

  async saveDocument (document: vscode.TextDocument, reason: TextDocumentSaveReason): Promise<void> {
    this.onWillSaveTextDocumentEmitter.fire({
      document,
      reason,
      waitUntil () {
        // Ignored
      }
    })

    try {
      await Promise.all(this.savehandlers.map(handler => {
        return handler.saveTextContent(document, reason)
      }))

      this.onDidSaveTextDocumentEmitter.fire(document)
    } catch (err) {
      monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Unable to save file on language server: ${document.uri.toString()}`, {
        cause: err as Error
      }))
    }
  }

  private autoSaveModels (): Disposable {
    const disposableCollection = new DisposableCollection()
    const timeoutMap = new Map<string, number>()
    disposableCollection.push(vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme !== 'file') {
        // Ignore non-file models
        return
      }
      const uri = e.document.uri.toString()
      const timeout = timeoutMap.get(uri)
      if (timeout != null) {
        window.clearTimeout(timeout)
        timeoutMap.delete(uri)
      }
      timeoutMap.set(uri, window.setTimeout(() => {
        timeoutMap.delete(uri)
        this.saveDocument(e.document, TextDocumentSaveReason.AfterDelay).catch((error: Error) => {
          monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Unable to save the document ${uri}`, {
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

  dispose (): void {
    this.autoSaveModelDisposable?.dispose()
    this.onWillSaveTextDocumentEmitter.dispose()
    this.onDidSaveTextDocumentEmitter.dispose()
  }
}
