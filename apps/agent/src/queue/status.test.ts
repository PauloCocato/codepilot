import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetWaitingCount = vi.fn().mockResolvedValue(5);
const mockGetActiveCount = vi.fn().mockResolvedValue(2);
const mockGetCompletedCount = vi.fn().mockResolvedValue(100);
const mockGetFailedCount = vi.fn().mockResolvedValue(3);
const mockGetDelayedCount = vi.fn().mockResolvedValue(1);
const mockGetPausedCount = vi.fn().mockResolvedValue(0);
const mockGetJob = vi.fn();
const mockGetCompleted = vi.fn().mockResolvedValue([]);
const mockGetFailed = vi.fn().mockResolvedValue([]);
const mockGetActive = vi.fn().mockResolvedValue([]);
const mockGetWaiting = vi.fn().mockResolvedValue([]);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    getFailedCount: mockGetFailedCount,
    getDelayedCount: mockGetDelayedCount,
    getPausedCount: mockGetPausedCount,
    getJob: mockGetJob,
    getCompleted: mockGetCompleted,
    getFailed: mockGetFailed,
    getActive: mockGetActive,
    getWaiting: mockGetWaiting,
    close: vi.fn(),
  })),
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  })),
}));

import { getQueueStats, getJobStatus, getRecentJobs } from './status.js';

describe('Queue Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return queue statistics', async () => {
    const stats = await getQueueStats();
    expect(stats).toEqual({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
      paused: 0,
    });
  });

  it('should return job status for existing job', async () => {
    mockGetJob.mockResolvedValue({
      id: 'test-job',
      progress: { step: 'plan', percent: 50 },
      data: { issueNumber: 1 },
      returnvalue: null,
      failedReason: undefined,
      attemptsMade: 1,
      timestamp: Date.now(),
      finishedOn: undefined,
      getState: vi.fn().mockResolvedValue('active'),
    });

    const result = await getJobStatus('test-job');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.job.id).toBe('test-job');
      expect(result.job.state).toBe('active');
    }
  });

  it('should return error for non-existent job', async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await getJobStatus('non-existent');
    expect(result.success).toBe(false);
  });

  it('should return recent jobs sorted by creation time', async () => {
    const now = Date.now();
    const mockJobs = [
      {
        id: 'job-1',
        data: {},
        returnvalue: null,
        failedReason: undefined,
        attemptsMade: 1,
        timestamp: now - 1000,
        finishedOn: now,
        progress: 100,
        getState: vi.fn().mockResolvedValue('completed'),
      },
      {
        id: 'job-2',
        data: {},
        returnvalue: null,
        failedReason: 'timeout',
        attemptsMade: 3,
        timestamp: now,
        finishedOn: now,
        progress: 50,
        getState: vi.fn().mockResolvedValue('failed'),
      },
    ];

    mockGetCompleted.mockResolvedValue([mockJobs[0]]);
    mockGetFailed.mockResolvedValue([mockJobs[1]]);

    const jobs = await getRecentJobs(10);
    expect(jobs.length).toBe(2);
    // Most recent first
    expect(jobs[0]!.id).toBe('job-2');
    expect(jobs[1]!.id).toBe('job-1');
  });

  it('should limit results', async () => {
    const jobs = await getRecentJobs(1);
    expect(jobs.length).toBeLessThanOrEqual(1);
  });
});
