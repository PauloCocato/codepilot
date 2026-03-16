import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger.js';
import {
  DatabaseError,
  insertLLMUsageSchema,
  type DbResult,
  type InsertLLMUsage,
  type LLMUsageRow,
  type ProviderStats,
} from '../types.js';

const TABLE = 'llm_usage';

export class LLMUsageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async record(data: InsertLLMUsage): Promise<DbResult<LLMUsageRow>> {
    const parsed = insertLLMUsageSchema.safeParse(data);
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
      logger.error({ error, data: parsed.data }, 'Failed to record LLM usage');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to record LLM usage: ${error.message}`,
          'INSERT_FAILED',
          error,
        ),
      };
    }

    logger.debug(
      {
        usageId: row.id,
        provider: row.provider,
        model: row.model,
        costUsd: row.cost_usd,
      },
      'LLM usage recorded',
    );

    return { success: true, data: row as LLMUsageRow };
  }

  async findByRunId(runId: string): Promise<DbResult<readonly LLMUsageRow[]>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error, runId }, 'Failed to find LLM usage by run id');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to find LLM usage: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []) as readonly LLMUsageRow[] };
  }

  async getProviderStats(since?: string): Promise<DbResult<readonly ProviderStats[]>> {
    let query = this.client.from(TABLE).select('provider, input_tokens, output_tokens, cost_usd');

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: rows, error } = await query;

    if (error) {
      logger.error({ error, since }, 'Failed to get provider stats');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to get provider stats: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    const allRows = rows ?? [];
    const grouped = new Map<
      string,
      { totalCalls: number; totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number }
    >();

    for (const row of allRows) {
      const existing = grouped.get(row.provider) ?? {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
      };

      grouped.set(row.provider, {
        totalCalls: existing.totalCalls + 1,
        totalInputTokens: existing.totalInputTokens + Number(row.input_tokens),
        totalOutputTokens: existing.totalOutputTokens + Number(row.output_tokens),
        totalCostUsd: existing.totalCostUsd + Number(row.cost_usd),
      });
    }

    const stats: ProviderStats[] = [];
    for (const [provider, values] of grouped) {
      stats.push({ provider, ...values });
    }

    return { success: true, data: stats };
  }
}
