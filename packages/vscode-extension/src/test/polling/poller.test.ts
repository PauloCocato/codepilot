import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Poller } from '../../polling/poller';
import type { CodePilotApiClient } from '../../api/client';
import type { JobStatus, QueueStats } from '../../types';

function createMockClient(overrides: Record<string, unknown> = {}): CodePilotApiClient {
  return {
    checkHealth: vi.fn().mockResolvedValue({ success: true, data: { status: 'ok' } }),
    getQueueStats: vi.fn().mockResolvedValue({
      success: true,
      data: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    }),
    getRecentJobs: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getJobStatus: vi.fn(),
    enqueueIssue: vi.fn(),
    listRepos: vi.fn(),
    getRepo: vi.fn(),
    updateServerUrl: vi.fn(),
    ...overrides,
  } as unknown as CodePilotApiClient;
}

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
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
};

describe('Poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should begin polling on start', () => {
    const client = createMockClient();
    const poller = new Poller(client, 5000);

    poller.start();

    expect(client.checkHealth).toHaveBeenCalledTimes(1);

    poller.dispose();
  });

  it('should clear interval on stop', async () => {
    const client = createMockClient();
    const poller = new Poller(client, 5000);

    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    poller.stop();
    await vi.advanceTimersByTimeAsync(10000);

    // After stop, no more polls should happen. checkHealth called on start + 1 interval
    expect(vi.mocked(client.checkHealth).mock.calls.length).toBeLessThanOrEqual(3);

    poller.dispose();
  });

  it('should not emit completion events on first poll', async () => {
    const jobs = [makeJob('j1', 'completed')];
    const client = createMockClient({
      getRecentJobs: vi.fn().mockResolvedValue({ success: true, data: jobs }),
      getQueueStats: vi.fn().mockResolvedValue({ success: true, data: defaultStats }),
    });
    const poller = new Poller(client, 5000);
    const completedHandler = vi.fn();
    poller.on('runCompleted', completedHandler);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(completedHandler).not.toHaveBeenCalled();

    poller.dispose();
  });

  it('should emit runCompleted on state transition to completed', async () => {
    const activeJob = makeJob('j1', 'active');
    const completedJob = makeJob('j1', 'completed');

    const getRecentJobs = vi.fn()
      .mockResolvedValueOnce({ success: true, data: [activeJob] })
      .mockResolvedValueOnce({ success: true, data: [completedJob] });

    const client = createMockClient({
      getRecentJobs,
      getQueueStats: vi.fn().mockResolvedValue({ success: true, data: defaultStats }),
    });

    const poller = new Poller(client, 5000);
    const completedHandler = vi.fn();
    poller.on('runCompleted', completedHandler);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(completedHandler).toHaveBeenCalledWith(completedJob);

    poller.dispose();
  });

  it('should emit runFailed on state transition to failed', async () => {
    const activeJob = makeJob('j1', 'active');
    const failedJob = makeJob('j1', 'failed');

    const getRecentJobs = vi.fn()
      .mockResolvedValueOnce({ success: true, data: [activeJob] })
      .mockResolvedValueOnce({ success: true, data: [failedJob] });

    const client = createMockClient({
      getRecentJobs,
      getQueueStats: vi.fn().mockResolvedValue({ success: true, data: defaultStats }),
    });

    const poller = new Poller(client, 5000);
    const failedHandler = vi.fn();
    poller.on('runFailed', failedHandler);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(failedHandler).toHaveBeenCalledWith(failedJob);

    poller.dispose();
  });

  it('should emit connectionChanged false on health check error', async () => {
    const client = createMockClient({
      checkHealth: vi.fn().mockResolvedValue({ success: false, error: 'ECONNREFUSED' }),
    });

    const poller = new Poller(client, 5000);
    const connectionHandler = vi.fn();
    poller.on('connectionChanged', connectionHandler);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(connectionHandler).toHaveBeenCalledWith(false);

    poller.dispose();
  });

  it('should emit connectionChanged true on recovery', async () => {
    const checkHealth = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'ECONNREFUSED' })
      .mockResolvedValueOnce({ success: true, data: { status: 'ok' } });

    const client = createMockClient({
      checkHealth,
      getRecentJobs: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getQueueStats: vi.fn().mockResolvedValue({ success: true, data: defaultStats }),
    });

    const poller = new Poller(client, 5000);
    const connectionHandler = vi.fn();
    poller.on('connectionChanged', connectionHandler);

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(connectionHandler).toHaveBeenCalledWith(false);
    expect(connectionHandler).toHaveBeenCalledWith(true);

    poller.dispose();
  });

  it('should stop polling on dispose', async () => {
    const client = createMockClient();
    const poller = new Poller(client, 5000);

    poller.start();
    poller.dispose();

    const callCount = vi.mocked(client.checkHealth).mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);

    expect(vi.mocked(client.checkHealth).mock.calls.length).toBe(callCount);
  });
});
