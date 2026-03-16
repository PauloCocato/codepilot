import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'config-reader' });

export const RepoConfigSchema = z.object({
  trigger_label: z.string().default('codepilot'),
  max_cost_usd: z.number().min(0.01).max(10).default(1.0),
  auto_merge: z.boolean().default(false),
  excluded_paths: z.array(z.string()).default([]),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  trigger_label: 'codepilot',
  max_cost_usd: 1.0,
  auto_merge: false,
  excluded_paths: [],
};

const CONFIG_FILE_PATH = '.codepilot.yml';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  readonly config: RepoConfig;
  readonly expiresAt: number;
}

const configCache = new Map<string, CacheEntry>();

export function clearConfigCache(): void {
  configCache.clear();
}

export async function readRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoConfig> {
  const cacheKey = `${owner}/${repo}`;
  const cached = configCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    log.debug({ owner, repo }, 'returning cached repo config');
    return cached.config;
  }

  let rawContent: string;
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: CONFIG_FILE_PATH,
    });

    const data = response.data;

    if (Array.isArray(data) || data.type !== 'file') {
      log.warn({ owner, repo }, '.codepilot.yml is not a file, using defaults');
      return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
    }

    if (!data.content) {
      log.info({ owner, repo }, '.codepilot.yml is empty, using defaults');
      return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
    }

    rawContent = Buffer.from(data.content, 'base64').toString('utf-8');
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      log.info({ owner, repo }, '.codepilot.yml not found, using defaults');
      return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
    }

    log.warn(
      { owner, repo, error },
      'failed to fetch .codepilot.yml, using defaults',
    );
    return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
  }

  try {
    const parsed: unknown = parseYaml(rawContent);

    if (parsed === null || parsed === undefined) {
      log.info({ owner, repo }, '.codepilot.yml is empty, using defaults');
      return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
    }

    const result = RepoConfigSchema.safeParse(parsed);

    if (!result.success) {
      log.warn(
        { owner, repo, errors: result.error.issues },
        '.codepilot.yml validation failed, using defaults',
      );
      return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
    }

    log.info({ owner, repo, config: result.data }, 'loaded repo config');
    return cacheAndReturn(cacheKey, result.data);
  } catch (error: unknown) {
    log.warn(
      { owner, repo, error },
      'failed to parse .codepilot.yml, using defaults',
    );
    return cacheAndReturn(cacheKey, DEFAULT_REPO_CONFIG);
  }
}

function cacheAndReturn(key: string, config: RepoConfig): RepoConfig {
  configCache.set(key, {
    config,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return config;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 404
  );
}
