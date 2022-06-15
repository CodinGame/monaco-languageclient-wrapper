import {
  DisposableCollection, MonacoLanguageClient
} from 'monaco-languageclient'
import { StaticFeature, FeatureState } from 'vscode-languageclient/lib/common/api'
import { InlayHint, InlayHintParams, InlayHintRefreshRequest, InlayHintRequest, WorkspaceEdit } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'

async function asInlayHints (values: InlayHint[] | undefined | null, client: MonacoLanguageClient): Promise<vscode.InlayHint[] | undefined> {
  if (!Array.isArray(values)) {
    return undefined
  }
  return values.map(lsHint => asInlayHint(lsHint, client))
}

function asInlayHint (value: InlayHint, client: MonacoLanguageClient): vscode.InlayHint {
  const label = value.label as string
  const result = new vscode.InlayHint(client.protocol2CodeConverter.asPosition(value.position), label)
  result.paddingRight = true
  result.kind = vscode.InlayHintKind.Parameter
  return result
}

/**
 * Comes from https://github.com/redhat-developer/vscode-java/blob/9b6046eecc65fd47507f309a3ccc9add45c6d3be/src/inlayHintsProvider.ts#L5
 */
class JavaInlayHintsProvider implements vscode.InlayHintsProvider {
  private onDidChange = new vscode.EventEmitter<void>()
  public onDidChangeInlayHints = this.onDidChange.event

  constructor (private client: MonacoLanguageClient) {
    this.client.onRequest(InlayHintRefreshRequest.type, async () => {
      this.onDidChange.fire()
    })
  }

  public async provideInlayHints (document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[] | undefined> {
    const requestParams: InlayHintParams = {
      textDocument: this.client.code2ProtocolConverter.asTextDocumentIdentifier(document),
      range: this.client.code2ProtocolConverter.asRange(range)
    }
    try {
      const values = await this.client.sendRequest(InlayHintRequest.type, requestParams, token)
      if (token.isCancellationRequested) {
        return []
      }
      return asInlayHints(values, this.client)
    } catch (error) {
      return this.client.handleFailedRequest(InlayHintRequest.type, token, error, [])
    }
  }
}

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

    this.disposables.push(vscode.languages.registerInlayHintsProvider(this.languageClient.clientOptions.documentSelector!, new JavaInlayHintsProvider(this.languageClient)))
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
