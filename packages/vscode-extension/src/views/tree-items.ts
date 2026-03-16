import * as vscode from 'vscode';
import type { JobStatus } from '../types';

export class SectionTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly sectionType: 'active' | 'recent' | 'stats',
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
  }
}

export class RunTreeItem extends vscode.TreeItem {
  constructor(public readonly job: JobStatus) {
    super(
      `#${job.data.issueNumber} - ${job.data.repoOwner}/${job.data.repoName}`,
      vscode.TreeItemCollapsibleState.None,
    );
    this.description = job.state;
    this.contextValue = `run-${job.state}`;
    this.tooltip = `Job: ${job.id}\nState: ${job.state}\nAttempts: ${job.attemptsMade}`;
    this.iconPath = RunTreeItem.getIcon(job.state);
  }

  private static getIcon(state: string): vscode.ThemeIcon {
    switch (state) {
      case 'active':
        return new vscode.ThemeIcon('sync~spin');
      case 'completed':
        return new vscode.ThemeIcon('check');
      case 'failed':
        return new vscode.ThemeIcon('error');
      case 'waiting':
        return new vscode.ThemeIcon('clock');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class StatTreeItem extends vscode.TreeItem {
  constructor(label: string, count: number) {
    super(`${label}: ${count}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}
