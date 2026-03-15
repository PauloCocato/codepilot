import { Webhooks } from '@octokit/webhooks';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

/** Trigger reason for a webhook event */
export type WebhookTrigger = 'issue_labeled' | 'issue_opened' | 'issue_comment';

/** Job to be added to the queue */
export interface WebhookJob {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly trigger: WebhookTrigger;
}

/** Queue interface for adding webhook jobs */
export interface JobQueue {
  add(name: string, data: WebhookJob): Promise<void>;
}

/** Options for creating the webhook handler */
export interface WebhookHandlerOptions {
  readonly webhookSecret: string;
  readonly queue: JobQueue;
  readonly triggerLabel?: string;
  readonly triggerCommand?: string;
  readonly maxConcurrentPerRepo?: number;
}

/** Zod schema for validating webhook issue payload */
const webhookIssueSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    labels: z.array(z.object({
      name: z.string(),
    })),
  }),
  repository: z.object({
    owner: z.object({
      login: z.string(),
    }),
    name: z.string(),
    full_name: z.string(),
  }),
  label: z.object({
    name: z.string(),
  }).optional(),
});

/** Zod schema for validating webhook comment payload */
const webhookCommentSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string(),
  }),
  comment: z.object({
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
  }),
  repository: z.object({
    owner: z.object({
      login: z.string(),
    }),
    name: z.string(),
    full_name: z.string(),
  }),
});

const DEFAULT_TRIGGER_LABEL = 'codepilot';
const DEFAULT_TRIGGER_COMMAND = '/codepilot';
const DEFAULT_MAX_CONCURRENT = 5;

/** Track active jobs per repository for rate limiting */
const activeJobsPerRepo = new Map<string, number>();

/** Check if repository has reached the concurrent job limit */
function isRateLimited(repoFullName: string, maxConcurrent: number): boolean {
  const active = activeJobsPerRepo.get(repoFullName) ?? 0;
  return active >= maxConcurrent;
}

/** Increment active job count for a repository */
export function incrementActiveJobs(repoFullName: string): void {
  const current = activeJobsPerRepo.get(repoFullName) ?? 0;
  activeJobsPerRepo.set(repoFullName, current + 1);
}

/** Decrement active job count for a repository */
export function decrementActiveJobs(repoFullName: string): void {
  const current = activeJobsPerRepo.get(repoFullName) ?? 0;
  activeJobsPerRepo.set(repoFullName, Math.max(0, current - 1));
}

/** Get active job count for a repository (for testing) */
export function getActiveJobs(repoFullName: string): number {
  return activeJobsPerRepo.get(repoFullName) ?? 0;
}

/** Reset all active jobs (for testing) */
export function resetActiveJobs(): void {
  activeJobsPerRepo.clear();
}

/** Create a webhook handler that processes GitHub App events */
export function createWebhookHandler(options: WebhookHandlerOptions): Webhooks {
  const log = logger.child({ module: 'github-app' });
  const triggerLabel = options.triggerLabel ?? DEFAULT_TRIGGER_LABEL;
  const triggerCommand = options.triggerCommand ?? DEFAULT_TRIGGER_COMMAND;
  const maxConcurrent = options.maxConcurrentPerRepo ?? DEFAULT_MAX_CONCURRENT;

  const webhooks = new Webhooks({ secret: options.webhookSecret });

  webhooks.on('issues.labeled', async ({ payload }) => {
    const parsed = webhookIssueSchema.safeParse(payload);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.issues }, 'Invalid webhook payload for issues.labeled');
      return;
    }

    const { issue, repository, label } = parsed.data;

    if (label?.name !== triggerLabel) {
      log.debug({ label: label?.name, triggerLabel }, 'Ignoring label event - not trigger label');
      return;
    }

    const repoFullName = repository.full_name;

    if (isRateLimited(repoFullName, maxConcurrent)) {
      log.warn({ repoFullName, maxConcurrent }, 'Rate limited - too many concurrent jobs for repository');
      return;
    }

    const job: WebhookJob = {
      owner: repository.owner.login,
      repo: repository.name,
      issueNumber: issue.number,
      trigger: 'issue_labeled',
    };

    log.info({ job }, 'Queueing job for labeled issue');
    incrementActiveJobs(repoFullName);
    await options.queue.add('process-issue', job);
  });

  webhooks.on('issues.opened', async ({ payload }) => {
    const parsed = webhookIssueSchema.safeParse(payload);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.issues }, 'Invalid webhook payload for issues.opened');
      return;
    }

    const { issue, repository } = parsed.data;

    const hasTriggerLabel = issue.labels.some((l) => l.name === triggerLabel);
    if (!hasTriggerLabel) {
      log.debug('Ignoring opened issue - no trigger label');
      return;
    }

    const repoFullName = repository.full_name;

    if (isRateLimited(repoFullName, maxConcurrent)) {
      log.warn({ repoFullName, maxConcurrent }, 'Rate limited - too many concurrent jobs for repository');
      return;
    }

    const job: WebhookJob = {
      owner: repository.owner.login,
      repo: repository.name,
      issueNumber: issue.number,
      trigger: 'issue_opened',
    };

    log.info({ job }, 'Queueing job for opened issue');
    incrementActiveJobs(repoFullName);
    await options.queue.add('process-issue', job);
  });

  webhooks.on('issue_comment.created', async ({ payload }) => {
    const parsed = webhookCommentSchema.safeParse(payload);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.issues }, 'Invalid webhook payload for issue_comment.created');
      return;
    }

    const { issue, comment, repository } = parsed.data;

    if (!comment.body.includes(triggerCommand)) {
      log.debug('Ignoring comment - no trigger command');
      return;
    }

    const repoFullName = repository.full_name;

    if (isRateLimited(repoFullName, maxConcurrent)) {
      log.warn({ repoFullName, maxConcurrent }, 'Rate limited - too many concurrent jobs for repository');
      return;
    }

    const job: WebhookJob = {
      owner: repository.owner.login,
      repo: repository.name,
      issueNumber: issue.number,
      trigger: 'issue_comment',
    };

    log.info({ job, commentUser: comment.user.login }, 'Queueing job from issue comment');
    incrementActiveJobs(repoFullName);
    await options.queue.add('process-issue', job);
  });

  log.info('Webhook handler created');

  return webhooks;
}
