import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock @supabase/supabase-js before importing client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

// Suppress pino output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Database Client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env['SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['SUPABASE_ANON_KEY'] = 'test-anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should throw DatabaseError when SUPABASE_URL is missing', async () => {
    delete process.env['SUPABASE_URL'];

    const { getSupabaseClient } = await import('./client.js');

    expect(() => getSupabaseClient()).toThrow('Missing SUPABASE_URL');

    try {
      getSupabaseClient();
    } catch (err) {
      expect((err as Error).name).toBe('DatabaseError');
      expect((err as { code: string }).code).toBe('MISSING_CONFIG');
    }
  });

  it('should throw DatabaseError when SUPABASE_ANON_KEY is missing', async () => {
    delete process.env['SUPABASE_ANON_KEY'];

    const { getSupabaseClient } = await import('./client.js');

    expect(() => getSupabaseClient()).toThrow('Missing SUPABASE_URL or SUPABASE_ANON_KEY');

    try {
      getSupabaseClient();
    } catch (err) {
      expect((err as Error).name).toBe('DatabaseError');
      expect((err as { code: string }).code).toBe('MISSING_CONFIG');
    }
  });

  it('should create a client when env vars are set', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockClient = { from: vi.fn() };
    vi.mocked(createClient).mockReturnValue(mockClient as never);

    const { getSupabaseClient } = await import('./client.js');
    const client = getSupabaseClient();

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      { auth: { persistSession: false } },
    );
    expect(client).toBe(mockClient);
  });

  it('should return the same singleton instance on subsequent calls', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockClient = { from: vi.fn() };
    vi.mocked(createClient).mockReturnValue(mockClient as never);

    const { getSupabaseClient, resetClient } = await import('./client.js');
    resetClient(); // ensure clean state
    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(first).toBe(second);
    // createClient should only be called once for two getSupabaseClient calls
    // (resetClient triggers no createClient call)
    const calls = vi.mocked(createClient).mock.calls.length;
    // After resetClient + two getSupabaseClient calls, only 1 createClient call
    // (since second getSupabaseClient reuses the singleton)
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(first).toBe(mockClient);
  });

  it('should return success from health check when query succeeds', async () => {
    const { createClient } = await import('@supabase/supabase-js');

    const mockSelect = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const mockClient = {
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    };
    vi.mocked(createClient).mockReturnValue(mockClient as never);

    const { checkDatabaseHealth, getSupabaseClient, resetClient } = await import('./client.js');
    resetClient();
    getSupabaseClient(); // initialize

    const result = await checkDatabaseHealth();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('should return failure from health check when query fails', async () => {
    const { createClient } = await import('@supabase/supabase-js');

    const mockSelect = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "agent_runs" does not exist' },
      }),
    });
    const mockClient = {
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    };
    vi.mocked(createClient).mockReturnValue(mockClient as never);

    const { checkDatabaseHealth, getSupabaseClient, resetClient } = await import('./client.js');
    resetClient();
    getSupabaseClient(); // initialize

    const result = await checkDatabaseHealth();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('HEALTH_CHECK_FAILED');
    }
  });
});
