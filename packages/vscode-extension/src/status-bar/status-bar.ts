import * as vscode from 'vscode';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'codepilot.showActiveRuns';
    this.item.show();
    this.updateChecking();
  }

  updateConnected(activeCount: number): void {
    this.item.text = activeCount > 0
      ? `$(rocket) CodePilot: ${activeCount} active`
      : '$(rocket) CodePilot: Ready';
    this.item.color = undefined;
    this.item.tooltip = 'Click to show active runs';
  }

  updateDisconnected(): void {
    this.item.text = '$(alert) CodePilot: Offline';
    this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.item.tooltip = 'Cannot connect to CodePilot server';
  }

  updateChecking(): void {
    this.item.text = '$(sync~spin) CodePilot';
    this.item.tooltip = 'Checking connection...';
  }

  dispose(): void {
    this.item.dispose();
  }
}
