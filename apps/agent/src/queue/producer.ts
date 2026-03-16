import { Queue } from "bullmq";
import { logger } from "../utils/logger.js";
import { getSharedConnectionOptions } from "./connection.js";
import {
  QUEUE_NAME,
  JOB_NAMES,
  type ResolveIssueJob,
  ResolveIssueJobSchema,
} from "./jobs.js";

/** Lazy-initialized queue instance */
let queue: Queue | undefined;

/** Get or create the queue */
export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getSharedConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}

/** Enqueue a resolve-issue job with deduplication */
export async function enqueueResolveIssue(
  data: ResolveIssueJob,
): Promise<
  { success: true; jobId: string } | { success: false; error: string }
> {
  const validated = ResolveIssueJobSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.message };
  }

  const q = getQueue();
  const jobId = `issue-${data.repoOwner}-${data.repoName}-${data.issueNumber}`;

  // Check for existing active job (deduplication)
  const existingJob = await q.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "active" || state === "waiting" || state === "delayed") {
      logger.info({ jobId, state }, "Job already exists, skipping");
      return { success: true, jobId };
    }
  }

  const job = await q.add(JOB_NAMES.RESOLVE_ISSUE, validated.data, { jobId });

  logger.info(
    {
      jobId: job.id,
      issueNumber: data.issueNumber,
      triggeredBy: data.triggeredBy,
    },
    "Job enqueued",
  );

  return { success: true, jobId: job.id ?? jobId };
}

/** Close the queue */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
    logger.info("Queue closed");
  }
}
