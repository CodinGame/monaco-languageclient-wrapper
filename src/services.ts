import * as vscode from 'vscode'
import { Infrastructure } from './infrastructure'

function updateServices(infrastructure: Infrastructure): void {
  if (infrastructure.workspaceFolders != null) {
    vscode.workspace.updateWorkspaceFolders(
      0,
      vscode.workspace.workspaceFolders?.length,
      ...infrastructure.workspaceFolders
    )
  }
}

export { updateServices }
