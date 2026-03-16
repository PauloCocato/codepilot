import { describe, it, expect, vi } from 'vitest';
import type { ParsedIssue } from '@codepilot/shared';
import type { VectorStore, SearchResult } from '../indexer/store.js';
import {
  searchForIssue,
  extractErrorMessages,
  extractKeywords,
  buildQueries,
  deduplicateResults,
  formatContextString,
} from './searcher.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function createMockIssue(overrides: Partial<ParsedIssue> = {}): ParsedIssue {
  return {
    number: 42,
    title: 'Fix login redirect bug',
    body: 'When clicking login, the user is not redirected to the dashboard.\nTypeError: Cannot read property "redirect" of undefined',
    labels: ['bug', 'auth'],
    repoOwner: 'acme',
    repoName: 'webapp',
    fileMentions: ['src/auth/login.ts', 'src/middleware/redirect.ts'],
    stepsToReproduce: '1. Go to /login\n2. Enter credentials\n3. Click submit',
    expectedBehavior: 'User should be redirected to /dashboard',
    ...overrides,
  };
}

function createMockStore(results: SearchResult[] = []): VectorStore {
  return {
    upsert: vi.fn(async () => undefined),
    search: vi.fn(async () => results),
    delete: vi.fn(async () => undefined),
    stats: vi.fn(async () => ({ totalChunks: 0, totalFiles: 0, languages: [] })),
  };
}

function createResult(filePath: string, score: number, content = 'code here'): SearchResult {
  return {
    chunk: {
      filePath,
      content,
      startLine: 1,
      endLine: 10,
      language: 'typescript',
      type: 'module' as const,
    },
    score,
  };
}

describe('searcher', () => {
  describe('extractErrorMessages', () => {
    it('should extract TypeError messages', () => {
      const text = 'TypeError: Cannot read property "foo" of undefined';
      const errors = extractErrorMessages(text);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('TypeError');
    });

    it('should extract module not found errors', () => {
      const text = "Cannot find module 'react'";
      const errors = extractErrorMessages(text);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Cannot find module');
    });

    it('should return empty array for text without errors', () => {
      const errors = extractErrorMessages('Everything is working fine');
      expect(errors).toHaveLength(0);
    });
  });

  describe('extractKeywords', () => {
    it('should extract meaningful keywords and filter stop words', () => {
      const issue = createMockIssue({ title: 'Fix the login redirect bug', body: '' });
      const keywords = extractKeywords(issue);
      expect(keywords).toContain('fix');
      expect(keywords).toContain('login');
      expect(keywords).toContain('redirect');
      expect(keywords).toContain('bug');
      expect(keywords).not.toContain('the');
    });

    it('should limit keywords to 20', () => {
      const longBody = Array.from({ length: 100 }, (_, i) => `keyword${i}`).join(' ');
      const issue = createMockIssue({ body: longBody });
      const keywords = extractKeywords(issue);
      expect(keywords.length).toBeLessThanOrEqual(20);
    });
  });

  describe('buildQueries', () => {
    it('should build multiple queries from issue', () => {
      const issue = createMockIssue();
      const queries = buildQueries(issue);

      expect(queries.length).toBeGreaterThanOrEqual(4);
      // Title query
      expect(queries[0]).toBe('Fix login redirect bug');
      // File mentions query
      expect(queries[1]).toContain('src/auth/login.ts');
    });

    it('should include error messages as a query', () => {
      const issue = createMockIssue();
      const queries = buildQueries(issue);
      const errorQuery = queries.find((q) => q.includes('TypeError'));
      expect(errorQuery).toBeDefined();
    });

    it('should include labels context', () => {
      const issue = createMockIssue();
      const queries = buildQueries(issue);
      const labelQuery = queries.find((q) => q.includes('bug') && q.includes('auth'));
      expect(labelQuery).toBeDefined();
    });
  });

  describe('deduplicateResults', () => {
    it('should keep higher scoring duplicates', () => {
      const set1 = [createResult('src/app.ts', 0.9)];
      const set2 = [createResult('src/app.ts', 0.8)];

      const deduplicated = deduplicateResults([set1, set2]);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].score).toBe(0.9);
    });

    it('should keep all unique results', () => {
      const set1 = [createResult('src/a.ts', 0.9)];
      const set2 = [createResult('src/b.ts', 0.8)];

      const deduplicated = deduplicateResults([set1, set2]);
      expect(deduplicated).toHaveLength(2);
    });

    it('should sort by score descending', () => {
      const set1 = [createResult('src/a.ts', 0.5)];
      const set2 = [createResult('src/b.ts', 0.9)];

      const deduplicated = deduplicateResults([set1, set2]);
      expect(deduplicated[0].chunk.filePath).toBe('src/b.ts');
      expect(deduplicated[1].chunk.filePath).toBe('src/a.ts');
    });
  });

  describe('formatContextString', () => {
    it('should format results with file path header', () => {
      const results = [createResult('src/app.ts', 0.95, 'const x = 1;')];
      const context = formatContextString(results);

      expect(context).toContain('src/app.ts');
      expect(context).toContain('const x = 1;');
      expect(context).toContain('0.950');
    });

    it('should respect max context size limit', () => {
      const longContent = 'x'.repeat(200_000);
      const results = [
        createResult('src/a.ts', 0.9, longContent),
        createResult('src/b.ts', 0.8, 'should not appear'),
      ];

      const context = formatContextString(results);
      // Should not exceed ~120K chars (30K tokens * 4 chars)
      expect(context.length).toBeLessThanOrEqual(120_001);
    });
  });

  describe('searchForIssue', () => {
    it('should execute multi-query strategy and return context', async () => {
      const results = [
        createResult('src/auth/login.ts', 0.9, 'export async function login() {}'),
        createResult('src/middleware/redirect.ts', 0.8, 'export function redirect() {}'),
      ];

      const store = createMockStore(results);
      const issue = createMockIssue();

      const context = await searchForIssue(issue, store);

      expect(context).toContain('src/auth/login.ts');
      expect(context).toContain('src/middleware/redirect.ts');
      // store.search should be called multiple times (once per query)
      expect(store.search).toHaveBeenCalledTimes(buildQueries(issue).length);
    });

    it('should handle store search failures gracefully', async () => {
      const store = createMockStore();
      (store.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection error'));
      (store.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        createResult('src/fallback.ts', 0.7, 'fallback code'),
      ]);

      const issue = createMockIssue();
      const context = await searchForIssue(issue, store);

      // Should still return results from successful queries
      expect(context).toContain('src/fallback.ts');
    });

    it('should return empty string for issue with no matching code', async () => {
      const store = createMockStore([]);
      const issue = createMockIssue();

      const context = await searchForIssue(issue, store);

      expect(context).toBe('');
    });
  });
});
