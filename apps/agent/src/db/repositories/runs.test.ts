import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AgentRunRepository } from './runs.js';
import type { InsertAgentRun } from '../types.js';

// Suppress pino output during tests
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockClient() {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(),
    limit: vi.fn(),
  };
  // Make each method return the chainable object so chaining works
  chainable.select.mockReturnValue(chainable);
  chainable.insert.mockReturnValue(chainable);
  chainable.update.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);
  chainable.range.mockReturnValue(chainable);

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

const VALID_INSERT: InsertAgentRun = {
  issue_number: 42,
  repo_owner: 'acme',
  repo_name: 'widget',
  issue_url: 'https://github.com/acme/widget/issues/42',
  status: 'pending',
  triggered_by: 'webhook',
  attempts: 0,
  total_cost_usd: 0,
  total_latency_ms: 0,
};

const MOCK_ROW = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  ...VALID_INSERT,
  patch: null,
  explanation: null,
  pr_url: null,
  pr_number: null,
  safety_score: null,
  error_message: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-03-16T00:00:00Z',
  updated_at: '2026-03-16T00:00:00Z',
};

describe('AgentRunRepository', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repo: AgentRunRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repo = new AgentRunRepository(mockClient as unknown as SupabaseClient);
  });

  describe('create', () => {
    it('should insert a new run and return the row', async () => {
      mockClient._chain.single.mockResolvedValue({ data: MOCK_ROW, error: null });

      const result = await repo.create(VALID_INSERT);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(MOCK_ROW.id);
        expect(result.data.issue_number).toBe(42);
      }
    });

    it('should return validation error for invalid data', async () => {
      const invalid = { ...VALID_INSERT, issue_number: -1 };

      const result = await repo.create(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error when insert fails', async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'duplicate key' },
      });

      const result = await repo.create(VALID_INSERT);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INSERT_FAILED');
      }
    });
  });

  describe('update', () => {
    it('should update a run and return the updated row', async () => {
      const updated = { ...MOCK_ROW, status: 'running' as const };
      mockClient._chain.single.mockResolvedValue({ data: updated, error: null });

      const result = await repo.update(MOCK_ROW.id, { status: 'running' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('running');
      }
    });

    it('should return error when update fails', async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      const result = await repo.update('nonexistent', { status: 'failed' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  describe('findById', () => {
    it('should return run with steps', async () => {
      // First call: agent_runs query
      const runChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_ROW, error: null }),
      };
      // Second call: agent_run_steps query
      const stepsChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockClient.from
        .mockReturnValueOnce(runChain)
        .mockReturnValueOnce(stepsChain);

      const result = await repo.findById(MOCK_ROW.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(MOCK_ROW.id);
        expect(result.data.steps).toEqual([]);
      }
    });
  });

  describe('findByIssue', () => {
    it('should return runs for a given issue', async () => {
      mockClient._chain.order.mockResolvedValue({ data: [MOCK_ROW], error: null });

      const result = await repo.findByIssue('acme', 'widget', 42);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].issue_number).toBe(42);
      }
    });
  });

  describe('findRecent', () => {
    it('should return paginated recent runs', async () => {
      mockClient._chain.range.mockResolvedValue({ data: [MOCK_ROW], error: null });

      const result = await repo.findRecent(10, 0);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });
  });

  describe('getStats', () => {
    it('should compute aggregate stats', async () => {
      mockClient._chain.select.mockResolvedValue({
        data: [
          { status: 'success', total_cost_usd: 0.05 },
          { status: 'success', total_cost_usd: 0.10 },
          { status: 'failed', total_cost_usd: 0.02 },
        ],
        error: null,
      });

      const result = await repo.getStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRuns).toBe(3);
        expect(result.data.successCount).toBe(2);
        expect(result.data.failureCount).toBe(1);
        expect(result.data.successRate).toBeCloseTo(2 / 3);
        expect(result.data.totalCostUsd).toBeCloseTo(0.17);
        expect(result.data.avgCostUsd).toBeCloseTo(0.17 / 3);
      }
    });

    it('should return zero stats when no runs exist', async () => {
      mockClient._chain.select.mockResolvedValue({ data: [], error: null });

      const result = await repo.getStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRuns).toBe(0);
        expect(result.data.successRate).toBe(0);
        expect(result.data.avgCostUsd).toBe(0);
      }
    });
  });
});
