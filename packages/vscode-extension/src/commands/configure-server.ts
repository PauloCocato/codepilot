import * as vscode from 'vscode';

export async function configureServer(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'codepilot.serverUrl',
  );
}
