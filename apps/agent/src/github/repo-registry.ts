import type { Octokit } from '@octokit/rest';
import type { RepoConfig } from './config-reader.js';
import { readRepoConfig, DEFAULT_REPO_CONFIG } from './config-reader.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'repo-registry' });

export interface RepoInfo {
  readonly owner: string;
  readonly repo: string;
  readonly installationId: number;
  readonly config: RepoConfig;
  readonly lastIndexedAt?: Date;
}

/** In-memory registry of repos CodePilot is tracking */
const registry = new Map<string, RepoInfo>();

function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * Register a repo in the registry. Fetches config from .codepilot.yml if
 * an octokit instance is provided, otherwise uses defaults.
 */
export async function registerRepo(
  owner: string,
  repo: string,
  installationId: number,
  octokit?: Octokit,
): Promise<RepoInfo> {
  const key = repoKey(owner, repo);

  let config: RepoConfig = DEFAULT_REPO_CONFIG;
  if (octokit) {
    try {
      config = await readRepoConfig(octokit, owner, repo);
    } catch (error) {
      log.warn({ owner, repo, error }, 'Failed to read repo config, using defaults');
    }
  }

  const info: RepoInfo = {
    owner,
    repo,
    installationId,
    config,
  };

  registry.set(key, info);
  log.info({ owner, repo, installationId }, 'Repo registered');

  return info;
}

/** Get a registered repo's info, or undefined if not registered */
export function getRepo(owner: string, repo: string): RepoInfo | undefined {
  return registry.get(repoKey(owner, repo));
}

/** List all registered repos */
export function listRepos(): readonly RepoInfo[] {
  return [...registry.values()];
}

/** Remove a repo from the registry */
export function unregisterRepo(owner: string, repo: string): void {
  const key = repoKey(owner, repo);
  const existed = registry.delete(key);

  if (existed) {
    log.info({ owner, repo }, 'Repo unregistered');
  } else {
    log.debug({ owner, repo }, 'Attempted to unregister unknown repo');
  }
}

/**
 * Re-fetch .codepilot.yml for a repo and update the registry.
 * Throws if the repo is not registered.
 */
export async function refreshRepoConfig(
  owner: string,
  repo: string,
  octokit: Octokit,
): Promise<RepoInfo> {
  const key = repoKey(owner, repo);
  const existing = registry.get(key);

  if (!existing) {
    throw new RepoRegistryError(
      `Repo ${key} is not registered`,
      'not_registered',
    );
  }

  const config = await readRepoConfig(octokit, owner, repo);

  const updated: RepoInfo = {
    ...existing,
    config,
  };

  registry.set(key, updated);
  log.info({ owner, repo, config }, 'Repo config refreshed');

  return updated;
}

/** Clear all entries — useful for testing */
export function clearRegistry(): void {
  registry.clear();
}

export class RepoRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_registered' | 'internal',
  ) {
    super(message);
    this.name = 'RepoRegistryError';
  }
}
