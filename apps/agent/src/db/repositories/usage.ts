import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger.js';
import {
  DatabaseError,
  insertUsageRecordSchema,
  type DbResult,
  type UsageLimitResult,
  type UsageRecordRow,
} from '../types.js';

const TABLE = 'usage_records';
const DEFAULT_MONTHLY_LIMIT = 5;

export class UsageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async record(
    installationId: number,
    issueNumber: number,
    repoOwner: string,
    repoName: string,
  ): Promise<DbResult<UsageRecordRow>> {
    const parsed = insertUsageRecordSchema.safeParse({
      installation_id: installationId,
      issue_number: issueNumber,
      repo_owner: repoOwner,
      repo_name: repoName,
      status: 'queued',
    });

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

    const { data: row, error } = await this.client
      .from(TABLE)
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      logger.error({ error, data: parsed.data }, 'Failed to record usage');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to record usage: ${error.message}`,
          'INSERT_FAILED',
          error,
        ),
      };
    }

    logger.info(
      { usageId: row.id, installationId, issueNumber },
      'Usage record created',
    );

    return { success: true, data: row as UsageRecordRow };
  }

  async updateStatus(
    id: string,
    status: string,
    costUsd?: number,
  ): Promise<DbResult<UsageRecordRow>> {
    const updateData: Record<string, unknown> = { status };
    if (costUsd !== undefined) {
      updateData['cost_usd'] = costUsd;
    }

    const { data: row, error } = await this.client
      .from(TABLE)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id, status }, 'Failed to update usage status');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to update usage status: ${error.message}`,
          'UPDATE_FAILED',
          error,
        ),
      };
    }

    logger.debug({ usageId: id, status, costUsd }, 'Usage status updated');

    return { success: true, data: row as UsageRecordRow };
  }

  async getMonthlyCount(installationId: number): Promise<DbResult<number>> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('id')
      .eq('installation_id', installationId)
      .gte('created_at', startOfMonth);

    if (error) {
      logger.error({ error, installationId }, 'Failed to get monthly usage count');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to get monthly usage count: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []).length };
  }

  async checkLimit(
    installationId: number,
    limit: number = DEFAULT_MONTHLY_LIMIT,
  ): Promise<DbResult<UsageLimitResult>> {
    const countResult = await this.getMonthlyCount(installationId);

    if (!countResult.success) {
      return countResult;
    }

    const used = countResult.data;

    return {
      success: true,
      data: {
        allowed: used < limit,
        used,
        limit,
      },
    };
  }
}
