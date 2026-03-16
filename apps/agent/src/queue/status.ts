import { getQueue } from "./producer.js";
import { logger } from "../utils/logger.js";

/** Queue statistics */
export interface QueueStats {
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
  readonly paused: number;
}

/** Job status information */
export interface JobStatus {
  readonly id: string;
  readonly state: string;
  readonly progress: unknown;
  readonly data: unknown;
  readonly result: unknown;
  readonly failedReason?: string;
  readonly attemptsMade: number;
  readonly createdAt: number;
  readonly finishedAt: number | undefined;
}

/** Get queue statistics */
export async function getQueueStats(): Promise<QueueStats> {
  const q = getQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed, paused: 0 };
}

/** Get status of a specific job */
export async function getJobStatus(
  jobId: string,
): Promise<
  { success: true; job: JobStatus } | { success: false; error: string }
> {
  const q = getQueue();
  const job = await q.getJob(jobId);

  if (!job) {
    return { success: false, error: `Job ${jobId} not found` };
  }

  const state = await job.getState();

  return {
    success: true,
    job: {
      id: job.id ?? jobId,
      state,
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    },
  };
}

/** Get recent jobs (completed + failed) */
export async function getRecentJobs(limit = 20): Promise<readonly JobStatus[]> {
  const q = getQueue();

  const [completed, failed, active, waiting] = await Promise.all([
    q.getCompleted(0, limit),
    q.getFailed(0, limit),
    q.getActive(0, limit),
    q.getWaiting(0, limit),
  ]);

  const allJobs = [...completed, ...failed, ...active, ...waiting];

  const statuses: JobStatus[] = [];
  for (const job of allJobs) {
    const state = await job.getState();
    statuses.push({
      id: job.id ?? "unknown",
      state,
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
    });
  }

  // Sort by creation time descending
  statuses.sort((a, b) => b.createdAt - a.createdAt);

  return statuses.slice(0, limit);
}
