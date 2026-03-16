import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerRepo,
  getRepo,
  listRepos,
  unregisterRepo,
  refreshRepoConfig,
  clearRegistry,
  RepoRegistryError,
} from './repo-registry.js';

describe('repo-registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('should store repo info when registering', async () => {
    const info = await registerRepo('acme', 'web-app', 12345);

    expect(info.owner).toBe('acme');
    expect(info.repo).toBe('web-app');
    expect(info.installationId).toBe(12345);
    expect(info.config).toBeDefined();
    expect(info.config.trigger_label).toBe('codepilot');
  });

  it('should return registered repo via getRepo', async () => {
    await registerRepo('acme', 'web-app', 12345);

    const info = getRepo('acme', 'web-app');

    expect(info).toBeDefined();
    expect(info?.owner).toBe('acme');
    expect(info?.repo).toBe('web-app');
  });

  it('should return undefined for unregistered repo', () => {
    const info = getRepo('unknown', 'repo');

    expect(info).toBeUndefined();
  });

  it('should list all registered repos', async () => {
    await registerRepo('acme', 'web-app', 100);
    await registerRepo('acme', 'api-server', 200);
    await registerRepo('other', 'lib', 300);

    const repos = listRepos();

    expect(repos).toHaveLength(3);
    const names = repos.map((r) => `${r.owner}/${r.repo}`);
    expect(names).toContain('acme/web-app');
    expect(names).toContain('acme/api-server');
    expect(names).toContain('other/lib');
  });

  it('should remove repo when unregistering', async () => {
    await registerRepo('acme', 'web-app', 12345);

    unregisterRepo('acme', 'web-app');

    expect(getRepo('acme', 'web-app')).toBeUndefined();
    expect(listRepos()).toHaveLength(0);
  });

  it('should throw when refreshing config for unregistered repo', async () => {
    const fakeOctokit = {} as Parameters<typeof refreshRepoConfig>[2];

    await expect(
      refreshRepoConfig('unknown', 'repo', fakeOctokit),
    ).rejects.toThrow(RepoRegistryError);
  });

  it('should register repos with different installation IDs', async () => {
    const info1 = await registerRepo('acme', 'web-app', 100);
    const info2 = await registerRepo('other', 'lib', 200);

    expect(info1.installationId).toBe(100);
    expect(info2.installationId).toBe(200);
  });

  it('should update existing entry when registering duplicate', async () => {
    await registerRepo('acme', 'web-app', 100);
    const updated = await registerRepo('acme', 'web-app', 999);

    expect(updated.installationId).toBe(999);
    expect(listRepos()).toHaveLength(1);

    const fetched = getRepo('acme', 'web-app');
    expect(fetched?.installationId).toBe(999);
  });

  it('should not throw when unregistering unknown repo', () => {
    expect(() => unregisterRepo('unknown', 'repo')).not.toThrow();
  });

  it('should return an empty list when no repos are registered', () => {
    expect(listRepos()).toHaveLength(0);
  });
});
