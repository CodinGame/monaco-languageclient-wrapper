import {
  MonacoWorkspace, TextDocument, TextDocumentSaveReason,
  ProtocolToMonacoConverter, MonacoToProtocolConverter, Emitter, Event, TextDocumentWillSaveEvent
} from '@codingame/monaco-languageclient'
import * as monaco from 'monaco-editor'
import type * as vscode from 'vscode'
import Configuration from './Configuration'
import { updateFile } from '../customRequests'
import { getAllLanguageClientManagersByTextDocument } from '../languageClient'

export default class CodinGameMonacoWorkspace extends MonacoWorkspace {
  protected readonly onWillSaveTextDocumentEmitter = new Emitter<TextDocumentWillSaveEvent>()
  protected readonly onDidSaveTextDocumentEmitter = new Emitter<TextDocument>()
  readonly workspaceFolders: typeof vscode.workspace.workspaceFolders

  configurations = new Configuration()

  constructor (
    p2m: ProtocolToMonacoConverter,
    m2p: MonacoToProtocolConverter,
    _rootUri: string | null = null) {
    super(monaco, p2m, m2p, _rootUri)

    // "workaround" for https://github.com/TypeFox/monaco-languageclient/pull/199#issuecomment-593414330
    if (_rootUri != null) {
      const uri = monaco.Uri.parse(_rootUri)
      this.workspaceFolders = [{
        uri,
        index: 0,
        name: uri.toString()
      }]
    }
  }

  get onWillSaveTextDocument (): Event<TextDocumentWillSaveEvent> {
    return this.onWillSaveTextDocumentEmitter.event
  }

  get onDidSaveTextDocument (): Event<TextDocument> {
    return this.onDidSaveTextDocumentEmitter.event
  }

  async saveDocument (document: TextDocument, reason: TextDocumentSaveReason): Promise<void> {
    this.onWillSaveTextDocumentEmitter.fire({
      textDocument: document,
      reason
    })

    try {
      await Promise.all(getAllLanguageClientManagersByTextDocument(document).map(async languageClient => {
        if (languageClient.isReady()) {
          await updateFile(document.uri.toString(), document.getText(), languageClient)
        }
      }))

      this.onDidSaveTextDocumentEmitter.fire(document)
    } catch (err) {
      console.error('Unable to save file on language server', err)
    }
  }
}
