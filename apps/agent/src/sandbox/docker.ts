import Dockerode from "dockerode";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";
import { detectRuntime } from "./detector.js";
import type { RuntimeConfig } from "./detector.js";

export interface Sandbox {
  readonly id: string;
  readonly containerId: string;
  readonly status: "running" | "stopped" | "error";
  readonly createdAt: Date;
  readonly repoPath: string;
  readonly runtimeConfig: RuntimeConfig;
}

export interface SandboxConfig {
  readonly repoPath: string;
  readonly language?: RuntimeConfig["language"];
  readonly timeout?: number;
  readonly memoryLimit?: number;
  readonly networkEnabled?: boolean;
}

const DEFAULT_MEMORY_LIMIT_MB = 512;
const SANDBOX_IMAGE_PREFIX = "codepilot-sandbox";
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(CURRENT_DIR, "templates");

export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "create_failed"
      | "destroy_failed"
      | "not_found"
      | "build_failed",
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

export class SandboxManager {
  private readonly docker: Dockerode;
  private readonly activeSandboxes: Map<string, Sandbox> = new Map();

  constructor(docker?: Dockerode) {
    this.docker = docker ?? new Dockerode();
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const id = randomUUID();
    const runtimeConfig = detectRuntime(config.repoPath);
    const dockerfilePath = join(TEMPLATES_DIR, runtimeConfig.dockerfile);
    const imageName = `${SANDBOX_IMAGE_PREFIX}:${id.slice(0, 8)}`;
    const memoryBytes =
      (config.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB) * 1024 * 1024;

    logger.info(
      {
        sandboxId: id,
        repoPath: config.repoPath,
        language: runtimeConfig.language,
      },
      "Creating sandbox container",
    );

    try {
      const buildStream = await this.docker.buildImage(
        {
          context: config.repoPath,
          src: ["."],
        },
        {
          t: imageName,
          dockerfile: dockerfilePath,
          networkmode: "none",
        },
      );

      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(buildStream, (err: Error | null) =>
          err ? reject(err) : resolve(),
        );
      });
    } catch (err) {
      throw new SandboxError(
        `Failed to build sandbox image: ${err instanceof Error ? err.message : String(err)}`,
        "build_failed",
      );
    }

    try {
      const container = await this.docker.createContainer({
        Image: imageName,
        name: `codepilot-sandbox-${id.slice(0, 8)}`,
        HostConfig: {
          Memory: memoryBytes,
          MemorySwap: memoryBytes,
          NetworkMode: config.networkEnabled ? "bridge" : "none",
          ReadonlyRootfs: false,
          SecurityOpt: ["no-new-privileges"],
          CapDrop: ["ALL"],
          PidsLimit: 256,
        },
        WorkingDir: "/workspace",
        Labels: {
          "codepilot.sandbox": "true",
          "codepilot.sandbox.id": id,
          "codepilot.sandbox.created": new Date().toISOString(),
        },
      });

      await container.start();

      const sandbox: Sandbox = {
        id,
        containerId: container.id,
        status: "running",
        createdAt: new Date(),
        repoPath: config.repoPath,
        runtimeConfig,
      };

      this.activeSandboxes.set(id, sandbox);

      logger.info(
        { sandboxId: id, containerId: container.id },
        "Sandbox container created and started",
      );

      return sandbox;
    } catch (err) {
      throw new SandboxError(
        `Failed to create sandbox container: ${err instanceof Error ? err.message : String(err)}`,
        "create_failed",
      );
    }
  }

  async destroySandbox(sandbox: Sandbox): Promise<void> {
    logger.info(
      { sandboxId: sandbox.id, containerId: sandbox.containerId },
      "Destroying sandbox container",
    );

    try {
      const container = this.docker.getContainer(sandbox.containerId);

      try {
        await container.stop({ t: 5 });
      } catch {
        // Container may already be stopped
      }

      await container.remove({ force: true, v: true });
      this.activeSandboxes.delete(sandbox.id);

      logger.info({ sandboxId: sandbox.id }, "Sandbox container destroyed");
    } catch (err) {
      throw new SandboxError(
        `Failed to destroy sandbox: ${err instanceof Error ? err.message : String(err)}`,
        "destroy_failed",
      );
    }
  }

  listActiveSandboxes(): readonly Sandbox[] {
    return [...this.activeSandboxes.values()];
  }

  async cleanupStale(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    const stale = [...this.activeSandboxes.values()].filter(
      (s) => now - s.createdAt.getTime() > maxAgeMs,
    );

    let removed = 0;

    for (const sandbox of stale) {
      try {
        await this.destroySandbox(sandbox);
        removed++;
      } catch (err) {
        logger.warn(
          {
            sandboxId: sandbox.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to cleanup stale sandbox",
        );
      }
    }

    if (removed > 0) {
      logger.info(
        { removed, total: stale.length },
        "Stale sandboxes cleaned up",
      );
    }

    return removed;
  }
}
