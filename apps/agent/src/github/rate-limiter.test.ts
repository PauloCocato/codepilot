import { describe, it, expect, beforeEach } from 'vitest';
import {
  canProcessRepo,
  acquireSlot,
  releaseSlot,
  getRepoStats,
  configureRateLimits,
  clearRateLimitCounters,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './rate-limiter.js';

describe('rate-limiter', () => {
  beforeEach(() => {
    clearRateLimitCounters();
  });

  it('should return true for canProcess when under limit', () => {
    expect(canProcessRepo('acme', 'web-app')).toBe(true);
  });

  it('should return false for canProcess when at max concurrent', () => {
    configureRateLimits({ maxConcurrentPerRepo: 1 });

    acquireSlot('acme', 'web-app');

    expect(canProcessRepo('acme', 'web-app')).toBe(false);
  });

  it('should increment active count on acquireSlot', () => {
    acquireSlot('acme', 'web-app');

    const stats = getRepoStats('acme', 'web-app');
    expect(stats.active).toBe(1);
    expect(stats.hourlyCount).toBe(1);
  });

  it('should decrement active count on releaseSlot', () => {
    acquireSlot('acme', 'web-app');
    releaseSlot('acme', 'web-app');

    const stats = getRepoStats('acme', 'web-app');
    expect(stats.active).toBe(0);
    // hourlyCount stays — it tracks total processed this hour
    expect(stats.hourlyCount).toBe(1);
  });

  it('should track hourly count correctly', () => {
    configureRateLimits({ maxConcurrentPerRepo: 10, maxPerHourPerRepo: 3 });

    acquireSlot('acme', 'web-app');
    releaseSlot('acme', 'web-app');
    acquireSlot('acme', 'web-app');
    releaseSlot('acme', 'web-app');
    acquireSlot('acme', 'web-app');
    releaseSlot('acme', 'web-app');

    // Should be at hourly limit now
    expect(canProcessRepo('acme', 'web-app')).toBe(false);
    expect(getRepoStats('acme', 'web-app').hourlyCount).toBe(3);
  });

  it('should return correct stats via getRepoStats', () => {
    acquireSlot('acme', 'web-app');
    acquireSlot('acme', 'web-app');

    const stats = getRepoStats('acme', 'web-app');
    expect(stats.active).toBe(2);
    expect(stats.hourlyCount).toBe(2);
  });

  it('should maintain independent limits for different repos', () => {
    configureRateLimits({ maxConcurrentPerRepo: 1 });

    acquireSlot('acme', 'web-app');

    expect(canProcessRepo('acme', 'web-app')).toBe(false);
    expect(canProcessRepo('other', 'lib')).toBe(true);
  });

  it('should use default config values', () => {
    expect(DEFAULT_RATE_LIMIT_CONFIG.maxConcurrentPerRepo).toBe(2);
    expect(DEFAULT_RATE_LIMIT_CONFIG.maxPerHourPerRepo).toBe(10);
  });

  it('should return zero stats for unknown repo', () => {
    const stats = getRepoStats('unknown', 'repo');
    expect(stats.active).toBe(0);
    expect(stats.hourlyCount).toBe(0);
  });

  it('should not decrement below zero on releaseSlot', () => {
    // Release without acquire should not crash
    releaseSlot('acme', 'web-app');

    const stats = getRepoStats('acme', 'web-app');
    expect(stats.active).toBe(0);
  });
});
