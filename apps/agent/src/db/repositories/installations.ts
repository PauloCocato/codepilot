import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger.js';
import {
  DatabaseError,
  insertInstallationSchema,
  type DbResult,
  type InsertInstallation,
  type InstallationRow,
} from '../types.js';

const TABLE = 'installations';

export class InstallationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsert(data: InsertInstallation): Promise<DbResult<InstallationRow>> {
    const parsed = insertInstallationSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: new DatabaseError(
          `Validation failed: ${parsed.error.message}`,
          'VALIDATION_ERROR',
          parsed.error,
        ),
      };
    }

    const now = new Date().toISOString();
    const upsertData = { ...parsed.data, updated_at: now };

    const { data: row, error } = await this.client
      .from(TABLE)
      .upsert(upsertData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error({ error, data: parsed.data }, 'Failed to upsert installation');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to upsert installation: ${error.message}`,
          'UPSERT_FAILED',
          error,
        ),
      };
    }

    logger.info(
      { installationId: row.id, accountLogin: row.account_login },
      'Installation upserted',
    );

    return { success: true, data: row as InstallationRow };
  }

  async delete(installationId: number): Promise<DbResult<InstallationRow>> {
    const now = new Date().toISOString();

    const { data: row, error } = await this.client
      .from(TABLE)
      .update({ status: 'deleted', updated_at: now })
      .eq('id', installationId)
      .select()
      .single();

    if (error) {
      logger.error({ error, installationId }, 'Failed to soft-delete installation');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to delete installation: ${error.message}`,
          'UPDATE_FAILED',
          error,
        ),
      };
    }

    logger.info({ installationId }, 'Installation soft-deleted');

    return { success: true, data: row as InstallationRow };
  }

  async getById(installationId: number): Promise<DbResult<InstallationRow | null>> {
    const { data: row, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', installationId)
      .maybeSingle();

    if (error) {
      logger.error({ error, installationId }, 'Failed to get installation');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to get installation: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (row as InstallationRow) ?? null };
  }

  async listActive(): Promise<DbResult<readonly InstallationRow[]>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error }, 'Failed to list active installations');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to list active installations: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []) as readonly InstallationRow[] };
  }
}
