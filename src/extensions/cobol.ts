import {
  Disposable, MonacoLanguageClient
} from 'monaco-languageclient'
import { StaticFeature, FeatureState, ProtocolRequestType } from 'vscode-languageclient/lib/common/api'
import { DocumentSelector, ServerCapabilities } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'

export const ResolveCobolSubroutineRequestType = new ProtocolRequestType<string, string, never, void, void>('cobol/resolveSubroutine')
export class CobolResolveSubroutineFeature implements StaticFeature {
  private onRequestDisposable: Disposable | undefined
  constructor (private languageClient: MonacoLanguageClient) {
  }

  fillClientCapabilities (): void {}

  initialize (capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    this.onRequestDisposable = this.languageClient.onRequest(ResolveCobolSubroutineRequestType, (routineName: string): string => {
      const constantRoutinePaths: Partial<Record<string, string>> = {
        'assert-equals': `file:${vscode.workspace.rootPath ?? '/tmp/project'}/deps/assert-equals.cbl`
      }
      const contantRoutinePath = constantRoutinePaths[routineName.toLowerCase()]
      if (contantRoutinePath != null) {
        return contantRoutinePath
      }
      return vscode.workspace.textDocuments
        .filter(textDocument => vscode.languages.match(documentSelector, textDocument))
        .filter(document => document.getText().match(new RegExp(`PROGRAM-ID\\.\\W+${routineName}\\.`, 'gi')))
        .sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()))[0]?.uri.toString()
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
