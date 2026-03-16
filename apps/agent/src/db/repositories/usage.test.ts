import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UsageRepository } from './usage.js';

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
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  chainable.select.mockReturnValue(chainable);
  chainable.insert.mockReturnValue(chainable);
  chainable.update.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.gte.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

const MOCK_USAGE_ROW = {
  id: '660e8400-e29b-41d4-a716-446655440001',
  installation_id: 12345,
  issue_number: 42,
  repo_owner: 'acme',
  repo_name: 'widget',
  status: 'queued',
  cost_usd: 0,
  created_at: '2026-03-16T00:00:00Z',
};

describe('UsageRepository', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repo: UsageRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repo = new UsageRepository(mockClient as unknown as SupabaseClient);
  });

  describe('record', () => {
    it('should create a usage entry with queued status', async () => {
      mockClient._chain.single.mockResolvedValue({ data: MOCK_USAGE_ROW, error: null });

      const result = await repo.record(12345, 42, 'acme', 'widget');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.installation_id).toBe(12345);
        expect(result.data.status).toBe('queued');
        expect(result.data.issue_number).toBe(42);
      }
    });

    it('should return validation error for invalid data', async () => {
      const result = await repo.record(-1, 42, 'acme', 'widget');

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

      const result = await repo.record(12345, 42, 'acme', 'widget');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INSERT_FAILED');
      }
    });
  });

  describe('updateStatus', () => {
    it('should update status and cost', async () => {
      const updatedRow = { ...MOCK_USAGE_ROW, status: 'success', cost_usd: 0.05 };
      mockClient._chain.single.mockResolvedValue({ data: updatedRow, error: null });

      const result = await repo.updateStatus(MOCK_USAGE_ROW.id, 'success', 0.05);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
        expect(result.data.cost_usd).toBe(0.05);
      }
    });

    it('should return error when update fails', async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      const result = await repo.updateStatus('nonexistent', 'failed');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  describe('getMonthlyCount', () => {
    it('should return correct count for current month', async () => {
      // gte() is the terminal call for this query chain
      mockClient._chain.gte.mockResolvedValue({
        data: [{ id: '1' }, { id: '2' }, { id: '3' }],
        error: null,
      });

      const result = await repo.getMonthlyCount(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(3);
      }
    });

    it('should filter by current month start date', async () => {
      mockClient._chain.gte.mockResolvedValue({ data: [], error: null });

      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      await repo.getMonthlyCount(12345);

      expect(mockClient._chain.gte).toHaveBeenCalledWith('created_at', expectedStart);
    });

    it('should return zero when no records exist in current month', async () => {
      mockClient._chain.gte.mockResolvedValue({ data: [], error: null });

      const result = await repo.getMonthlyCount(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });
  });

  describe('checkLimit', () => {
    it('should allow when under limit', async () => {
      mockClient._chain.gte.mockResolvedValue({
        data: [{ id: '1' }, { id: '2' }],
        error: null,
      });

      const result = await repo.checkLimit(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.used).toBe(2);
        expect(result.data.limit).toBe(5);
      }
    });

    it('should block when at limit', async () => {
      mockClient._chain.gte.mockResolvedValue({
        data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
        error: null,
      });

      const result = await repo.checkLimit(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.used).toBe(5);
      }
    });

    it('should use default limit of 5', async () => {
      mockClient._chain.gte.mockResolvedValue({ data: [], error: null });

      const result = await repo.checkLimit(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(5);
      }
    });

    it('should accept custom limit', async () => {
      mockClient._chain.gte.mockResolvedValue({
        data: [{ id: '1' }, { id: '2' }],
        error: null,
      });

      const result = await repo.checkLimit(12345, 10);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.limit).toBe(10);
      }
    });
  });
});
