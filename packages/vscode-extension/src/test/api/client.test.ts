import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodePilotApiClient } from '../../api/client';
import type { EnqueueRequest } from '../../types';

const SERVER_URL = 'http://localhost:3000';

function mockFetchResponse(body: unknown, status = 200, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: status === 200 ? 'OK' : 'Bad Request',
      json: () => Promise.resolve(body),
    })
  );
}

function mockFetchError(error: Error): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
}

describe('CodePilotApiClient', () => {
  let client: CodePilotApiClient;

  beforeEach(() => {
    client = new CodePilotApiClient(SERVER_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkHealth returns data on success', async () => {
    const health = { status: 'ok', version: '0.2.0', uptime: 12345 };
    mockFetchResponse(health);

    const result = await client.checkHealth();

    expect(result).toEqual({ success: true, data: health });
  });

  it('checkHealth returns error on network failure', async () => {
    mockFetchError(new Error('ECONNREFUSED'));

    const result = await client.checkHealth();

    expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
  });

  it('getQueueStats returns stats', async () => {
    const stats = { waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0, paused: 0 };
    mockFetchResponse(stats);

    const result = await client.getQueueStats();

    expect(result).toEqual({ success: true, data: stats });
  });

  it('getRecentJobs returns jobs array', async () => {
    const jobs = [
      { id: 'job-1', state: 'completed', data: {}, result: null, attemptsMade: 1, createdAt: 0 },
      { id: 'job-2', state: 'active', data: {}, result: null, attemptsMade: 0, createdAt: 1 },
    ];
    mockFetchResponse(jobs);

    const result = await client.getRecentJobs(10);

    expect(result).toEqual({ success: true, data: jobs });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${SERVER_URL}/api/queue/jobs?limit=10`,
      expect.any(Object)
    );
  });

  it('getJobStatus returns single job', async () => {
    const job = {
      id: 'job-42',
      state: 'completed',
      progress: null,
      data: { issueUrl: 'https://github.com/o/r/issues/1' },
      result: { success: true, prUrl: 'https://github.com/o/r/pull/2' },
      attemptsMade: 1,
      createdAt: 1000,
      finishedAt: 2000,
    };
    mockFetchResponse(job);

    const result = await client.getJobStatus('job-42');

    expect(result).toEqual({ success: true, data: job });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${SERVER_URL}/api/queue/jobs/job-42`,
      expect.any(Object)
    );
  });

  it('enqueueIssue sends POST with correct body', async () => {
    const enqueueData: EnqueueRequest = {
      issueUrl: 'https://github.com/owner/repo/issues/5',
      repoOwner: 'owner',
      repoName: 'repo',
      issueNumber: 5,
      triggeredBy: 'api',
      installationId: 123,
    };
    mockFetchResponse({ jobId: 'new-job-1' });

    const result = await client.enqueueIssue(enqueueData);

    expect(result).toEqual({ success: true, data: { jobId: 'new-job-1' } });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${SERVER_URL}/api/queue/enqueue`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(enqueueData),
      })
    );
  });

  it('enqueueIssue returns error on 400', async () => {
    mockFetchResponse({ error: 'Missing required field: issueUrl' }, 400, false);

    const result = await client.enqueueIssue({
      issueUrl: '',
      repoOwner: 'owner',
      repoName: 'repo',
      issueNumber: 0,
      triggeredBy: 'api',
      installationId: 123,
    });

    expect(result).toEqual({ success: false, error: 'Missing required field: issueUrl' });
  });

  it('listRepos returns repos array', async () => {
    const repos = [
      { owner: 'owner', repo: 'repo-a', installationId: 1, config: {}, rateLimit: { active: 0, hourlyCount: 0 } },
      { owner: 'owner', repo: 'repo-b', installationId: 2, config: {}, rateLimit: { active: 1, hourlyCount: 5 } },
    ];
    mockFetchResponse(repos);

    const result = await client.listRepos();

    expect(result).toEqual({ success: true, data: repos });
  });

  it('request times out after 10 seconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      })
    );

    // Use fake timers to avoid actually waiting 10 seconds
    vi.useFakeTimers();
    const promise = client.checkHealth();
    vi.advanceTimersByTime(10_000);

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('aborted');
    }

    vi.useRealTimers();
  });

  it('updateServerUrl changes the base URL', async () => {
    const newUrl = 'http://production:8080';
    client.updateServerUrl(newUrl);

    const health = { status: 'ok', version: '1.0.0', uptime: 999 };
    mockFetchResponse(health);

    await client.checkHealth();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${newUrl}/health`,
      expect.any(Object)
    );
  });
});
