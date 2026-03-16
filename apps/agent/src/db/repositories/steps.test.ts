import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RunStepRepository } from './steps.js';

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
    single: vi.fn(),
  };
  chainable.select.mockReturnValue(chainable);
  chainable.insert.mockReturnValue(chainable);
  chainable.update.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const STEP_ID = '660e8400-e29b-41d4-a716-446655440001';

const MOCK_STEP = {
  id: STEP_ID,
  run_id: RUN_ID,
  step_name: 'parse',
  status: 'running',
  duration_ms: null,
  cost_usd: null,
  metadata: {},
  error_message: null,
  started_at: '2026-03-16T00:00:00Z',
  completed_at: null,
  created_at: '2026-03-16T00:00:00Z',
};

describe('RunStepRepository', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repo: RunStepRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repo = new RunStepRepository(mockClient as unknown as SupabaseClient);
  });

  describe('create', () => {
    it('should create a step with running status and started_at', async () => {
      mockClient._chain.single.mockResolvedValue({ data: MOCK_STEP, error: null });

      const result = await repo.create(RUN_ID, 'parse');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.run_id).toBe(RUN_ID);
        expect(result.data.step_name).toBe('parse');
        expect(result.data.status).toBe('running');
      }
    });

    it('should return validation error for invalid run_id', async () => {
      const result = await repo.create('not-a-uuid', 'parse');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error when insert fails', async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'foreign key violation' },
      });

      const result = await repo.create(RUN_ID, 'parse');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INSERT_FAILED');
      }
    });
  });

  describe('complete', () => {
    it('should mark a step as completed with status', async () => {
      const completed = { ...MOCK_STEP, status: 'success', completed_at: '2026-03-16T00:01:00Z' };
      mockClient._chain.single.mockResolvedValue({ data: completed, error: null });

      const result = await repo.complete(STEP_ID, 'success', { filesProcessed: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
      }
    });

    it('should return error when update fails', async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      const result = await repo.complete(STEP_ID, 'failed');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  describe('findByRunId', () => {
    it('should return all steps for a run ordered by created_at', async () => {
      mockClient._chain.order.mockResolvedValue({
        data: [MOCK_STEP],
        error: null,
      });

      const result = await repo.findByRunId(RUN_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].run_id).toBe(RUN_ID);
      }
    });

    it('should return empty array when no steps exist', async () => {
      mockClient._chain.order.mockResolvedValue({ data: [], error: null });

      const result = await repo.findByRunId(RUN_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });
});
