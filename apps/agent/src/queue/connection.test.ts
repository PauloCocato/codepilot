import { describe, it, expect, afterEach } from "vitest";
import {
  getConnectionOptions,
  getSharedConnectionOptions,
} from "./connection.js";

describe("Redis Connection", () => {
  const originalEnv = process.env["REDIS_URL"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["REDIS_URL"] = originalEnv;
    } else {
      delete process.env["REDIS_URL"];
    }
  });

  it("should return default connection options", () => {
    delete process.env["REDIS_URL"];
    const opts = getConnectionOptions();
    expect(opts.host).toBe("localhost");
    expect(opts.port).toBe(6379);
    expect(opts.maxRetriesPerRequest).toBeNull();
  });

  it("should parse REDIS_URL", () => {
    process.env["REDIS_URL"] = "redis://myhost:6380";
    const opts = getConnectionOptions();
    expect(opts.host).toBe("myhost");
    expect(opts.port).toBe(6380);
  });

  it("should fallback on invalid URL", () => {
    process.env["REDIS_URL"] = "not a valid url %%%";
    const opts = getConnectionOptions();
    expect(opts.host).toBe("localhost");
    expect(opts.port).toBe(6379);
  });

  it("should return shared options", () => {
    const opts = getSharedConnectionOptions();
    expect(opts).toBeDefined();
    expect(opts.maxRetriesPerRequest).toBeNull();
  });
});
