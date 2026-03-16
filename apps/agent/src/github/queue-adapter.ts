import { logger } from "../utils/logger.js";
import { enqueueResolveIssue } from "../queue/index.js";
import type { JobQueue, WebhookJob } from "./app.js";
import type { ResolveIssueJob } from "../queue/jobs.js";

/**
 * Adapter that bridges WebhookJob from the GitHub App webhook handler
 * to ResolveIssueJob consumed by the BullMQ queue.
 */
export class WebhookQueueAdapter implements JobQueue {
  private readonly log = logger.child({ module: "webhook-queue-adapter" });

  /** Transform a WebhookJob into a ResolveIssueJob and enqueue it */
  async add(_name: string, data: WebhookJob): Promise<void> {
    const issueUrl = `https://github.com/${data.owner}/${data.repo}/issues/${data.issueNumber}`;

    const resolveJob: ResolveIssueJob = {
      issueUrl,
      repoOwner: data.owner,
      repoName: data.repo,
      issueNumber: data.issueNumber,
      triggeredBy: "webhook",
      installationId: data.installationId,
    };

    this.log.info(
      {
        issueUrl,
        trigger: data.trigger,
        installationId: data.installationId,
      },
      "Transforming webhook job to resolve-issue job",
    );

    const result = await enqueueResolveIssue(resolveJob);

    if (!result.success) {
      this.log.error(
        { error: result.error, issueUrl },
        "Failed to enqueue resolve-issue job",
      );
      throw new Error(`Failed to enqueue job: ${result.error}`);
    }

    this.log.info(
      { jobId: result.jobId, issueUrl },
      "Resolve-issue job enqueued successfully",
    );
  }
}
