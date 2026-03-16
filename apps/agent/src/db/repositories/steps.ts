import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger.js';
import {
  DatabaseError,
  completeRunStepSchema,
  insertRunStepSchema,
  type AgentRunStepRow,
  type CompleteRunStep,
  type DbResult,
} from '../types.js';

const TABLE = 'agent_run_steps';

export class RunStepRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(runId: string, stepName: string): Promise<DbResult<AgentRunStepRow>> {
    const input = {
      run_id: runId,
      step_name: stepName,
      status: 'running' as const,
      started_at: new Date().toISOString(),
    };

    const parsed = insertRunStepSchema.safeParse(input);
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
      logger.error({ error, runId, stepName }, 'Failed to create run step');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to create run step: ${error.message}`,
          'INSERT_FAILED',
          error,
        ),
      };
    }

    logger.debug({ stepId: row.id, runId, stepName }, 'Run step created');
    return { success: true, data: row as AgentRunStepRow };
  }

  async complete(
    id: string,
    status: CompleteRunStep['status'],
    metadata?: Record<string, unknown>,
  ): Promise<DbResult<AgentRunStepRow>> {
    const input: CompleteRunStep = {
      status,
      completed_at: new Date().toISOString(),
      metadata,
    };

    const parsed = completeRunStepSchema.safeParse(input);
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
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id, status }, 'Failed to complete run step');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to complete run step: ${error.message}`,
          'UPDATE_FAILED',
          error,
        ),
      };
    }

    logger.debug({ stepId: id, status }, 'Run step completed');
    return { success: true, data: row as AgentRunStepRow };
  }

  async findByRunId(runId: string): Promise<DbResult<readonly AgentRunStepRow[]>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error, runId }, 'Failed to find steps by run id');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to find steps: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []) as readonly AgentRunStepRow[] };
  }
}
