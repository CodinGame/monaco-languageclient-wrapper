import {
  ProtocolRequestType,
  DocumentSelector,
  ServerCapabilities
} from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { ExtensionFeature } from './tools'
import { MonacoLanguageClient } from '../createLanguageClient.js'

export const ResolveCobolSubroutineRequestType = new ProtocolRequestType<
  string,
  string | undefined,
  never,
  void,
  void
>('cobol/resolveSubroutine')
export class CobolResolveSubroutineFeature extends ExtensionFeature {
  constructor(private languageClient: MonacoLanguageClient) {
    super()
  }

  activate(
    context: vscode.ExtensionContext,
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector
  ): void {
    context.subscriptions.push(
      this.languageClient.onRequest(
        ResolveCobolSubroutineRequestType,
        (routineName: string): string | undefined => {
          const constantRoutinePaths: Partial<Record<string, string>> = {
            'assert-equals': `file:${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '/tmp/project'}/deps/assert-equals.cbl`
          }
          const contantRoutinePath = constantRoutinePaths[routineName.toLowerCase()]
          if (contantRoutinePath != null) {
            return contantRoutinePath
          }
          return vscode.workspace.textDocuments
            .filter((textDocument) => vscode.languages.match(documentSelector, textDocument))
            .filter((document) =>
              document.getText().match(new RegExp(`PROGRAM-ID\\.\\W+${routineName}\\.`, 'gi'))
            )
            .sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()))[0]
            ?.uri.toString()
        }
      )
    )
  }
}
