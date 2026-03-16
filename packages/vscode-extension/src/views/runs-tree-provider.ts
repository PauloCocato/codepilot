import * as vscode from 'vscode';
import type { JobStatus, QueueStats } from '../types';
import { SectionTreeItem, RunTreeItem, StatTreeItem } from './tree-items';

export class RunsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private jobs: readonly JobStatus[] = [];
  private stats: QueueStats | null = null;

  refresh(jobs: readonly JobStatus[], stats: QueueStats): void {
    this.jobs = jobs;
    this.stats = stats;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return [
        new SectionTreeItem('Active Runs', 'active'),
        new SectionTreeItem('Recent Runs', 'recent'),
        new SectionTreeItem('Queue Stats', 'stats'),
      ];
    }

    if (element instanceof SectionTreeItem) {
      return this.getSectionChildren(element.sectionType);
    }

    return [];
  }

  private getSectionChildren(sectionType: 'active' | 'recent' | 'stats'): vscode.TreeItem[] {
    switch (sectionType) {
      case 'active': {
        const activeJobs = this.jobs.filter(
          (j) => j.state === 'active' || j.state === 'waiting',
        );
        if (activeJobs.length === 0) {
          const placeholder = new vscode.TreeItem('No active runs');
          placeholder.iconPath = new vscode.ThemeIcon('info');
          return [placeholder];
        }
        return activeJobs.map((j) => new RunTreeItem(j));
      }
      case 'recent': {
        const recentJobs = this.jobs
          .filter((j) => j.state === 'completed' || j.state === 'failed')
          .slice(0, 10);
        if (recentJobs.length === 0) {
          const placeholder = new vscode.TreeItem('No recent runs');
          placeholder.iconPath = new vscode.ThemeIcon('info');
          return [placeholder];
        }
        return recentJobs.map((j) => new RunTreeItem(j));
      }
      case 'stats': {
        if (!this.stats) {
          const placeholder = new vscode.TreeItem('No stats available');
          placeholder.iconPath = new vscode.ThemeIcon('info');
          return [placeholder];
        }
        return [
          new StatTreeItem('Waiting', this.stats.waiting),
          new StatTreeItem('Active', this.stats.active),
          new StatTreeItem('Completed', this.stats.completed),
          new StatTreeItem('Failed', this.stats.failed),
          new StatTreeItem('Delayed', this.stats.delayed),
          new StatTreeItem('Paused', this.stats.paused),
        ];
      }
    }
  }
}
