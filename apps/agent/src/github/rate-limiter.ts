import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'rate-limiter' });

export interface RateLimitConfig {
  readonly maxConcurrentPerRepo: number;
  readonly maxPerHourPerRepo: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxConcurrentPerRepo: 2,
  maxPerHourPerRepo: 10,
};

interface RepoCounters {
  active: number;
  readonly hourlyTimestamps: number[];
}

/** In-memory per-repo rate limiting counters */
const counters = new Map<string, RepoCounters>();

let config: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };

function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function getOrCreateCounters(key: string): RepoCounters {
  let entry = counters.get(key);
  if (!entry) {
    entry = { active: 0, hourlyTimestamps: [] };
    counters.set(key, entry);
  }
  return entry;
}

/** Prune timestamps older than 1 hour */
function pruneHourly(timestamps: number[]): void {
  const oneHourAgo = Date.now() - 3_600_000;
  while (timestamps.length > 0 && (timestamps[0] ?? Infinity) < oneHourAgo) {
    timestamps.shift();
  }
}

/** Configure rate limits (call before using other functions) */
export function configureRateLimits(newConfig: Partial<RateLimitConfig>): void {
  config = {
    ...config,
    ...newConfig,
  };
  log.info({ config }, 'Rate limits configured');
}

/** Check if a repo can accept another processing job */
export function canProcessRepo(owner: string, repo: string): boolean {
  const key = repoKey(owner, repo);
  const entry = getOrCreateCounters(key);

  pruneHourly(entry.hourlyTimestamps);

  if (entry.active >= config.maxConcurrentPerRepo) {
    log.debug(
      { owner, repo, active: entry.active, max: config.maxConcurrentPerRepo },
      'Repo at max concurrent limit',
    );
    return false;
  }

  if (entry.hourlyTimestamps.length >= config.maxPerHourPerRepo) {
    log.debug(
      { owner, repo, hourlyCount: entry.hourlyTimestamps.length, max: config.maxPerHourPerRepo },
      'Repo at hourly limit',
    );
    return false;
  }

  return true;
}

/**
 * Try to acquire a processing slot for a repo.
 * Returns true if the slot was acquired, false if limits are exceeded.
 */
export function acquireSlot(owner: string, repo: string): boolean {
  if (!canProcessRepo(owner, repo)) {
    return false;
  }

  const key = repoKey(owner, repo);
  const entry = getOrCreateCounters(key);

  entry.active += 1;
  entry.hourlyTimestamps.push(Date.now());

  log.info(
    { owner, repo, active: entry.active, hourlyCount: entry.hourlyTimestamps.length },
    'Slot acquired',
  );

  return true;
}

/** Release a processing slot when a job completes */
export function releaseSlot(owner: string, repo: string): void {
  const key = repoKey(owner, repo);
  const entry = counters.get(key);

  if (!entry || entry.active <= 0) {
    log.warn({ owner, repo }, 'Attempted to release slot with no active slots');
    return;
  }

  entry.active -= 1;

  log.info(
    { owner, repo, active: entry.active },
    'Slot released',
  );
}

/** Get current stats for a repo */
export function getRepoStats(
  owner: string,
  repo: string,
): { readonly active: number; readonly hourlyCount: number } {
  const key = repoKey(owner, repo);
  const entry = counters.get(key);

  if (!entry) {
    return { active: 0, hourlyCount: 0 };
  }

  pruneHourly(entry.hourlyTimestamps);

  return {
    active: entry.active,
    hourlyCount: entry.hourlyTimestamps.length,
  };
}

/** Clear all counters — useful for testing */
export function clearRateLimitCounters(): void {
  counters.clear();
  config = { ...DEFAULT_RATE_LIMIT_CONFIG };
}
