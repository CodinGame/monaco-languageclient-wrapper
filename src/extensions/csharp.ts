import { MonacoLanguageClient } from 'monaco-languageclient'
import { Uri, ExtensionContext, workspace, CancellationToken } from 'vscode'
import { ProtocolRequestType } from 'vscode-languageserver-protocol'
import { ExtensionFeature } from './tools'

const OmnisharpMetadataRequestType = new ProtocolRequestType<{
  Timeout: number
  AssemblyName: string
  Language: string | null
  ProjectName: string
  TypeName: string
  VersionNumber: string | null
}, {
  Source: string
  SourceName: string
}, never, void, void>('o#/metadata')

export class CsharpExtensionFeature extends ExtensionFeature {
  constructor (private languageClient: MonacoLanguageClient) {
    super()
  }

  activate (context: ExtensionContext): void {
    context.subscriptions.push(workspace.registerTextDocumentContentProvider('omnisharp-metadata', {
      provideTextDocumentContent: async (uri: Uri, token: CancellationToken): Promise<string> => {
        const [, project, assembly, typeName] = /^\/Project\/(.*)\/Assembly\/(.*)\/Symbol\/(.*).cs$/.exec(uri.fsPath)!
        const { Source } = await this.languageClient.sendRequest(OmnisharpMetadataRequestType, {
          Timeout: 5000,
          AssemblyName: assembly!.replace(/\//g, '.'),
          Language: null,
          ProjectName: project!,
          TypeName: typeName!.replace(/\//g, '.'),
          VersionNumber: null
        }, token)
        return Source
      }
    }))
  }
}
