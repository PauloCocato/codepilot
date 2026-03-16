import { Worker, Job } from "bullmq";
import { logger } from "../utils/logger.js";
import { getSharedConnectionOptions } from "./connection.js";
import {
  QUEUE_NAME,
  type ResolveIssueJob,
  type ResolveIssueResult,
  validateJobData,
} from "./jobs.js";

/** Worker processing function type */
export type ProcessFunction = (
  issueUrl: string,
) => Promise<ResolveIssueResult>;

/** Create and start the BullMQ worker */
export function createWorker(
  processFn: ProcessFunction,
): Worker<ResolveIssueJob, ResolveIssueResult> {
  const concurrency = Number(process.env["WORKER_CONCURRENCY"] ?? 2);

  const worker = new Worker<ResolveIssueJob, ResolveIssueResult>(
    QUEUE_NAME,
    async (job: Job<ResolveIssueJob, ResolveIssueResult>) => {
      const validation = validateJobData(job.data);
      if (!validation.success) {
        throw new Error(`Invalid job data: ${validation.error}`);
      }

      const { issueUrl, issueNumber, repoOwner, repoName, triggeredBy } =
        job.data;

      logger.info(
        { jobId: job.id, issueNumber, repoOwner, repoName, triggeredBy },
        "Processing job",
      );

      // Update progress at start
      await job.updateProgress({ step: "starting", percent: 0 });

      try {
        const result = await processFn(issueUrl);

        // Update progress to complete
        await job.updateProgress({ step: "done", percent: 100 });

        logger.info(
          {
            jobId: job.id,
            issueNumber,
            success: result.success,
            costUsd: result.totalCostUsd,
            prUrl: result.prUrl,
          },
          "Job completed",
        );

        return result;
      } catch (err) {
        logger.error({ jobId: job.id, issueNumber, err }, "Job failed");
        throw err;
      }
    },
    {
      connection: getSharedConnectionOptions(),
      concurrency,
      limiter: {
        max: 10,
        duration: 60_000, // Max 10 jobs per minute
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, issueNumber: job.data.issueNumber },
      "Job completed event",
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        issueNumber: job?.data.issueNumber,
        err: err.message,
      },
      "Job failed event",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker error");
  });

  logger.info({ concurrency }, "Worker started");

  return worker;
}

/** Close a worker gracefully */
export async function closeWorker(worker: Worker): Promise<void> {
  await worker.close();
  logger.info("Worker closed");
}
