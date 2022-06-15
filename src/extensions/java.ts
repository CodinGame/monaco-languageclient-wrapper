import {
  DisposableCollection, MonacoLanguageClient
} from 'monaco-languageclient'
import { StaticFeature, FeatureState } from 'vscode-languageclient/lib/common/api'
import { WorkspaceEdit } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'

export class JavaExtensionFeature implements StaticFeature {
  private disposables: DisposableCollection
  constructor (private languageClient: MonacoLanguageClient) {
    this.disposables = new DisposableCollection()
  }

  fillClientCapabilities (): void {}

  initialize (): void {
    // Comes from https://github.com/redhat-developer/vscode-java/blob/9b6046eecc65fd47507f309a3ccc9add45c6d3be/src/standardLanguageClient.ts#L321
    this.disposables.push(vscode.commands.registerCommand('java.apply.workspaceEdit', async (obj: WorkspaceEdit) => {
      const edit = await this.languageClient.protocol2CodeConverter.asWorkspaceEdit(obj)
      return vscode.workspace.applyEdit(edit)
    }))
  }

  getState (): FeatureState {
    return {
      kind: 'static'
    }
  }

  dispose (): void {
    this.disposables.dispose()
  }
}
