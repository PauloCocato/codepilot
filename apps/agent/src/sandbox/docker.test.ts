import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxManager, SandboxError } from './docker.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./detector.js', () => ({
  detectRuntime: vi.fn(() => ({
    language: 'node',
    dockerfile: 'Dockerfile.node',
    installCmd: 'npm install',
    testCmd: 'npm test',
    buildCmd: 'npm run build',
  })),
}));

function createMockDocker() {
  const mockContainer = {
    id: 'container-abc123',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  const mockDocker = {
    buildImage: vi.fn().mockResolvedValue('mock-stream'),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    modem: {
      followProgress: vi.fn((_stream: unknown, callback: (err: Error | null) => void) => {
        callback(null);
      }),
    },
  };

  return { mockDocker, mockContainer };
}

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let mockDocker: ReturnType<typeof createMockDocker>['mockDocker'];
  let mockContainer: ReturnType<typeof createMockDocker>['mockContainer'];

  beforeEach(() => {
    const mocks = createMockDocker();
    mockDocker = mocks.mockDocker;
    mockContainer = mocks.mockContainer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager = new SandboxManager(mockDocker as any);
  });

  describe('createSandbox', () => {
    it('should create a sandbox with default settings', async () => {
      const sandbox = await manager.createSandbox({
        repoPath: '/tmp/test-repo',
      });

      expect(sandbox.status).toBe('running');
      expect(sandbox.repoPath).toBe('/tmp/test-repo');
      expect(sandbox.containerId).toBe('container-abc123');
      expect(sandbox.id).toBeDefined();
      expect(sandbox.createdAt).toBeInstanceOf(Date);
    });

    it('should build image with network disabled', async () => {
      await manager.createSandbox({ repoPath: '/tmp/test-repo' });

      expect(mockDocker.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({ context: '/tmp/test-repo' }),
        expect.objectContaining({ networkmode: 'none' }),
      );
    });

    it('should create container with security constraints', async () => {
      await manager.createSandbox({ repoPath: '/tmp/test-repo' });

      const createCall = mockDocker.createContainer.mock.calls[0][0];

      expect(createCall.HostConfig.NetworkMode).toBe('none');
      expect(createCall.HostConfig.SecurityOpt).toContain('no-new-privileges');
      expect(createCall.HostConfig.CapDrop).toContain('ALL');
      expect(createCall.HostConfig.PidsLimit).toBe(256);
      expect(createCall.HostConfig.Memory).toBe(512 * 1024 * 1024);
    });

    it('should allow custom memory limit', async () => {
      await manager.createSandbox({
        repoPath: '/tmp/test-repo',
        memoryLimit: 1024,
      });

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      expect(createCall.HostConfig.Memory).toBe(1024 * 1024 * 1024);
    });

    it('should allow enabling network when explicitly set', async () => {
      await manager.createSandbox({
        repoPath: '/tmp/test-repo',
        networkEnabled: true,
      });

      const createCall = mockDocker.createContainer.mock.calls[0][0];
      expect(createCall.HostConfig.NetworkMode).toBe('bridge');
    });

    it('should throw SandboxError when build fails', async () => {
      mockDocker.modem.followProgress.mockImplementation(
        (_stream: unknown, callback: (err: Error | null) => void) => {
          callback(new Error('Build failed'));
        },
      );

      await expect(
        manager.createSandbox({ repoPath: '/tmp/test-repo' }),
      ).rejects.toThrow(SandboxError);
    });

    it('should throw SandboxError when container creation fails', async () => {
      mockDocker.createContainer.mockRejectedValue(new Error('No space'));

      await expect(
        manager.createSandbox({ repoPath: '/tmp/test-repo' }),
      ).rejects.toThrow(SandboxError);
    });
  });

  describe('destroySandbox', () => {
    it('should stop and remove the container', async () => {
      const sandbox = await manager.createSandbox({ repoPath: '/tmp/test-repo' });
      await manager.destroySandbox(sandbox);

      expect(mockContainer.stop).toHaveBeenCalled();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true, v: true });
    });

    it('should remove sandbox from active list', async () => {
      const sandbox = await manager.createSandbox({ repoPath: '/tmp/test-repo' });

      expect(manager.listActiveSandboxes()).toHaveLength(1);

      await manager.destroySandbox(sandbox);

      expect(manager.listActiveSandboxes()).toHaveLength(0);
    });

    it('should handle container already stopped', async () => {
      mockContainer.stop.mockRejectedValue(new Error('Not running'));

      const sandbox = await manager.createSandbox({ repoPath: '/tmp/test-repo' });
      await manager.destroySandbox(sandbox);

      expect(mockContainer.remove).toHaveBeenCalled();
    });
  });

  describe('listActiveSandboxes', () => {
    it('should return empty array initially', () => {
      expect(manager.listActiveSandboxes()).toEqual([]);
    });

    it('should return all active sandboxes', async () => {
      await manager.createSandbox({ repoPath: '/tmp/repo1' });
      await manager.createSandbox({ repoPath: '/tmp/repo2' });

      expect(manager.listActiveSandboxes()).toHaveLength(2);
    });
  });

  describe('cleanupStale', () => {
    it('should remove sandboxes older than maxAgeMs', async () => {
      const sandbox = await manager.createSandbox({ repoPath: '/tmp/test-repo' });

      // Force createdAt to be old
      const oldSandbox = { ...sandbox, createdAt: new Date(Date.now() - 120_000) };
      // Replace the sandbox in the internal map via the manager
      // We need to access the private map — use a workaround
      const activeSandboxes = (manager as unknown as { activeSandboxes: Map<string, unknown> }).activeSandboxes;
      activeSandboxes.set(sandbox.id, oldSandbox);

      const removed = await manager.cleanupStale(60_000);

      expect(removed).toBe(1);
      expect(manager.listActiveSandboxes()).toHaveLength(0);
    });

    it('should not remove sandboxes within maxAgeMs', async () => {
      await manager.createSandbox({ repoPath: '/tmp/test-repo' });

      const removed = await manager.cleanupStale(600_000);

      expect(removed).toBe(0);
      expect(manager.listActiveSandboxes()).toHaveLength(1);
    });
  });
});
