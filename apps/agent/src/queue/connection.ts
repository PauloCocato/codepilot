import { logger } from "../utils/logger.js";

/** Redis connection options for BullMQ */
export interface RedisConnectionOptions {
  readonly host: string;
  readonly port: number;
  readonly maxRetriesPerRequest: null;
}

/** Parse REDIS_URL into host/port or return defaults */
export function getConnectionOptions(): RedisConnectionOptions {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: Number(parsed.port) || 6379,
      maxRetriesPerRequest: null, // Required by BullMQ
    };
  } catch {
    logger.warn({ url }, "Failed to parse REDIS_URL, using defaults");
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

/** Shared connection options singleton */
let connectionOptions: RedisConnectionOptions | undefined;

/** Get shared connection options */
export function getSharedConnectionOptions(): RedisConnectionOptions {
  if (!connectionOptions) {
    connectionOptions = getConnectionOptions();
    logger.info(
      { host: connectionOptions.host, port: connectionOptions.port },
      "Redis connection configured",
    );
  }
  return connectionOptions;
}

/** Close shared connection (resets config) */
export async function closeSharedConnection(): Promise<void> {
  connectionOptions = undefined;
  logger.info("Redis connection config reset");
}
