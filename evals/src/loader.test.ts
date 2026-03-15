import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadSuite, listSuites } from './loader.js';

const SUITES_DIR = new URL('./suites', import.meta.url).pathname;

describe('loadSuite', () => {
  it('should load and validate the codepilot-basic suite', async () => {
    const suite = await loadSuite(join(SUITES_DIR, 'codepilot-basic.json'));

    expect(suite.name).toBe('codepilot-basic');
    expect(suite.cases.length).toBe(10);
    expect(suite.cases[0].id).toBe('basic-001');
  });

  it('should throw on invalid suite file', async () => {
    await expect(
      loadSuite(join(SUITES_DIR, 'nonexistent.json')),
    ).rejects.toThrow();
  });

  it('should validate schema strictly — reject malformed JSON structure', async () => {
    // Create a temporary bad file via in-memory validation
    const { EvalSuiteSchema } = await import('./types.js');

    const badData = {
      name: '',
      description: 'test',
      cases: [],
      createdAt: '2026-01-01',
    };

    const result = EvalSuiteSchema.safeParse(badData);
    expect(result.success).toBe(false);
  });
});

describe('listSuites', () => {
  it('should list available suite files', async () => {
    const suites = await listSuites(SUITES_DIR);

    expect(suites).toContain('codepilot-basic.json');
    expect(suites.length).toBeGreaterThanOrEqual(1);
  });

  it('should return only .json files', async () => {
    const suites = await listSuites(SUITES_DIR);

    for (const file of suites) {
      expect(file).toMatch(/\.json$/);
    }
  });

  it('should throw on nonexistent directory', async () => {
    await expect(listSuites('/nonexistent/path')).rejects.toThrow();
  });
});
