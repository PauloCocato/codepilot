import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import { RunsTreeProvider } from '../../views/runs-tree-provider';
import { SectionTreeItem, RunTreeItem, StatTreeItem } from '../../views/tree-items';
import type { JobStatus, QueueStats } from '../../types';

function makeJob(id: string, state: string): JobStatus {
  return {
    id,
    state: state as JobStatus['state'],
    progress: null,
    data: {
      issueUrl: `https://github.com/o/r/issues/1`,
      repoOwner: 'o',
      repoName: 'r',
      issueNumber: 1,
      triggeredBy: 'api',
      installationId: 1,
    },
    result: null,
    attemptsMade: 0,
    createdAt: Date.now(),
    finishedAt: undefined,
  };
}

const defaultStats: QueueStats = {
  waiting: 2,
  active: 1,
  completed: 10,
  failed: 3,
  delayed: 0,
  paused: 0,
};

describe('RunsTreeProvider', () => {
  it('should return 3 sections at root level', () => {
    const provider = new RunsTreeProvider();
    const children = provider.getChildren();

    expect(children).toHaveLength(3);
    expect(children[0]).toBeInstanceOf(SectionTreeItem);
    expect(children[1]).toBeInstanceOf(SectionTreeItem);
    expect(children[2]).toBeInstanceOf(SectionTreeItem);
  });

  it('should show active and waiting jobs under Active Runs section', () => {
    const provider = new RunsTreeProvider();
    const jobs = [
      makeJob('j1', 'active'),
      makeJob('j2', 'waiting'),
      makeJob('j3', 'completed'),
    ];
    provider.refresh(jobs, defaultStats);

    const sections = provider.getChildren();
    const activeSection = sections[0] as SectionTreeItem;
    const activeChildren = provider.getChildren(activeSection);

    expect(activeChildren).toHaveLength(2);
    expect(activeChildren[0]).toBeInstanceOf(RunTreeItem);
    expect(activeChildren[1]).toBeInstanceOf(RunTreeItem);
  });

  it('should show completed and failed jobs under Recent Runs section', () => {
    const provider = new RunsTreeProvider();
    const jobs = [
      makeJob('j1', 'active'),
      makeJob('j2', 'completed'),
      makeJob('j3', 'failed'),
    ];
    provider.refresh(jobs, defaultStats);

    const sections = provider.getChildren();
    const recentSection = sections[1] as SectionTreeItem;
    const recentChildren = provider.getChildren(recentSection);

    expect(recentChildren).toHaveLength(2);
    expect(recentChildren[0]).toBeInstanceOf(RunTreeItem);
    expect(recentChildren[1]).toBeInstanceOf(RunTreeItem);
  });

  it('should show stat items under Queue Stats section', () => {
    const provider = new RunsTreeProvider();
    provider.refresh([], defaultStats);

    const sections = provider.getChildren();
    const statsSection = sections[2] as SectionTreeItem;
    const statsChildren = provider.getChildren(statsSection);

    expect(statsChildren).toHaveLength(6);
    expect(statsChildren[0]).toBeInstanceOf(StatTreeItem);
  });

  it('should fire onDidChangeTreeData when refresh is called', () => {
    const provider = new RunsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.refresh([], defaultStats);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should show placeholder when no active runs exist', () => {
    const provider = new RunsTreeProvider();
    provider.refresh([], defaultStats);

    const sections = provider.getChildren();
    const activeSection = sections[0] as SectionTreeItem;
    const activeChildren = provider.getChildren(activeSection);

    expect(activeChildren).toHaveLength(1);
    expect(activeChildren[0]).not.toBeInstanceOf(RunTreeItem);
    expect(activeChildren[0].label).toBe('No active runs');
  });
});
