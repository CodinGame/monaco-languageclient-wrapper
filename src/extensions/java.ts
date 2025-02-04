import { commands, Uri, languages, ExtensionContext, workspace, CancellationToken } from 'vscode'
import { Position as LSPosition, Location as LSLocation } from 'vscode-languageclient'
import { JavaInlayHintsProvider } from 'extensions/java/inlayHintsProvider'
import { registerCommands as registerJavaCommands } from 'extensions/java/sourceAction'
import { Commands } from 'extensions/java/commands'
import { applyWorkspaceEdit } from 'extensions/java/extension'
import { ClassFileContentsRequest } from 'extensions/java/protocol'
import { ExtensionFeature } from './tools.js'
import { MonacoLanguageClient } from '../createLanguageClient.js'

export class JavaExtensionFeature extends ExtensionFeature {
  constructor(private languageClient: MonacoLanguageClient) {
    super()
  }

  activate(context: ExtensionContext): void {
    /**
     * The next 3 commands come from https://github.com/redhat-developer/vscode-java/blob/4810edd542cecb654ac1152985b4a9da0f921c08/src/standardLanguageClient.ts#L328
     * They can't be imported because they are in the middle of a complex function
     * Only those 3 are important to us
     */
    context.subscriptions.push(
      commands.registerCommand(
        Commands.SHOW_JAVA_REFERENCES,
        (uri: string, position: LSPosition, locations: LSLocation[]) => {
          void commands.executeCommand(
            Commands.SHOW_REFERENCES,
            Uri.parse(uri),
            this.languageClient.protocol2CodeConverter.asPosition(position),
            locations.map(this.languageClient.protocol2CodeConverter.asLocation)
          )
        }
      )
    )
    context.subscriptions.push(
      commands.registerCommand(
        Commands.SHOW_JAVA_IMPLEMENTATIONS,
        (uri: string, position: LSPosition, locations: LSLocation[]) => {
          void commands.executeCommand(
            Commands.SHOW_REFERENCES,
            Uri.parse(uri),
            this.languageClient.protocol2CodeConverter.asPosition(position),
            locations.map(this.languageClient.protocol2CodeConverter.asLocation)
          )
        }
      )
    )
    context.subscriptions.push(
      commands.registerCommand(Commands.APPLY_WORKSPACE_EDIT, (obj) => {
        void applyWorkspaceEdit(obj, this.languageClient)
      })
    )

    context.subscriptions.push(
      languages.registerInlayHintsProvider(
        this.languageClient.clientOptions.documentSelector!,
        new JavaInlayHintsProvider(this.languageClient)
      )
    )

    registerJavaCommands(this.languageClient, context)

    /**
     * It comes from https://github.com/redhat-developer/vscode-java/blob/cf8b8bcce9b4bf1691fa3dd89bcd40db0ca093bd/src/providerDispatcher.ts#L30
     */
    context.subscriptions.push(
      workspace.registerTextDocumentContentProvider('jdt', {
        provideTextDocumentContent: async (uri: Uri, token: CancellationToken): Promise<string> => {
          return this.languageClient
            .sendRequest(ClassFileContentsRequest.type, { uri: uri.toString() }, token)
            .then((v: string | undefined): string => {
              return v ?? ''
            })
        }
      })
    )
  }
}
