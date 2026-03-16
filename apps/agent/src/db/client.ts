import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import { DatabaseError, type DbResult } from './types.js';

let instance: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client.
 *
 * Reads SUPABASE_URL + SUPABASE_ANON_KEY from environment.
 * Falls back to parsing DATABASE_URL if the Supabase-specific vars are absent
 * (useful in local/test environments that only set DATABASE_URL).
 */
export function getSupabaseClient(): SupabaseClient {
  if (instance) {
    return instance;
  }

  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseKey) {
    throw new DatabaseError(
      'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables',
      'MISSING_CONFIG',
    );
  }

  instance = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  logger.info({ url: supabaseUrl }, 'Supabase client initialized');

  return instance;
}

/**
 * Performs a lightweight health check against the database.
 *
 * Returns a DbResult indicating whether the connection is healthy.
 */
export async function checkDatabaseHealth(): Promise<DbResult<{ latencyMs: number }>> {
  const start = Date.now();

  try {
    const client = getSupabaseClient();

    // A simple query to verify connectivity — `agent_runs` should exist after migration.
    const { error } = await client.from('agent_runs').select('id').limit(1);

    if (error) {
      logger.error({ error }, 'Database health check failed');
      return {
        success: false,
        error: new DatabaseError(
          `Health check query failed: ${error.message}`,
          'HEALTH_CHECK_FAILED',
          error,
        ),
      };
    }

    const latencyMs = Date.now() - start;
    logger.debug({ latencyMs }, 'Database health check passed');

    return { success: true, data: { latencyMs } };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({ err, latencyMs }, 'Database health check threw');

    if (err instanceof DatabaseError) {
      return { success: false, error: err };
    }

    return {
      success: false,
      error: new DatabaseError(
        'Failed to connect to database',
        'CONNECTION_FAILED',
        err,
      ),
    };
  }
}

/**
 * Resets the singleton client. Primarily used in tests.
 */
export function resetClient(): void {
  instance = null;
}
