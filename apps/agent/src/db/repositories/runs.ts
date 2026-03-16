import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger.js';
import {
  DatabaseError,
  insertAgentRunSchema,
  updateAgentRunSchema,
  type AgentRunRow,
  type AgentRunStepRow,
  type AgentRunStats,
  type AgentRunWithSteps,
  type DbResult,
  type InsertAgentRun,
  type UpdateAgentRun,
} from '../types.js';

const TABLE = 'agent_runs';
const STEPS_TABLE = 'agent_run_steps';

export class AgentRunRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(data: InsertAgentRun): Promise<DbResult<AgentRunRow>> {
    const parsed = insertAgentRunSchema.safeParse(data);
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
      logger.error({ error, data: parsed.data }, 'Failed to create agent run');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to create agent run: ${error.message}`,
          'INSERT_FAILED',
          error,
        ),
      };
    }

    logger.info({ runId: row.id, issueNumber: row.issue_number }, 'Agent run created');
    return { success: true, data: row as AgentRunRow };
  }

  async update(id: string, data: UpdateAgentRun): Promise<DbResult<AgentRunRow>> {
    const parsed = updateAgentRunSchema.safeParse(data);
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

    const updateData = { ...parsed.data, updated_at: new Date().toISOString() };

    const { data: row, error } = await this.client
      .from(TABLE)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id, data: parsed.data }, 'Failed to update agent run');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to update agent run: ${error.message}`,
          'UPDATE_FAILED',
          error,
        ),
      };
    }

    logger.debug({ runId: id, status: row.status }, 'Agent run updated');
    return { success: true, data: row as AgentRunRow };
  }

  async findById(id: string): Promise<DbResult<AgentRunWithSteps>> {
    const { data: run, error: runError } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (runError) {
      logger.error({ error: runError, id }, 'Failed to find agent run by id');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to find agent run: ${runError.message}`,
          'QUERY_FAILED',
          runError,
        ),
      };
    }

    const { data: steps, error: stepsError } = await this.client
      .from(STEPS_TABLE)
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });

    if (stepsError) {
      logger.error({ error: stepsError, id }, 'Failed to fetch steps for agent run');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to fetch steps: ${stepsError.message}`,
          'QUERY_FAILED',
          stepsError,
        ),
      };
    }

    return {
      success: true,
      data: {
        ...(run as AgentRunRow),
        steps: (steps ?? []) as readonly AgentRunStepRow[],
      },
    };
  }

  async findByIssue(
    repoOwner: string,
    repoName: string,
    issueNumber: number,
  ): Promise<DbResult<readonly AgentRunRow[]>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('repo_owner', repoOwner)
      .eq('repo_name', repoName)
      .eq('issue_number', issueNumber)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, repoOwner, repoName, issueNumber }, 'Failed to find runs by issue');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to find runs by issue: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []) as readonly AgentRunRow[] };
  }

  async findRecent(
    limit: number = 20,
    offset: number = 0,
  ): Promise<DbResult<readonly AgentRunRow[]>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error, limit, offset }, 'Failed to find recent runs');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to find recent runs: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    return { success: true, data: (rows ?? []) as readonly AgentRunRow[] };
  }

  async getStats(): Promise<DbResult<AgentRunStats>> {
    const { data: rows, error } = await this.client
      .from(TABLE)
      .select('status, total_cost_usd');

    if (error) {
      logger.error({ error }, 'Failed to get agent run stats');
      return {
        success: false,
        error: new DatabaseError(
          `Failed to get stats: ${error.message}`,
          'QUERY_FAILED',
          error,
        ),
      };
    }

    const allRows = rows ?? [];
    const totalRuns = allRows.length;
    const successCount = allRows.filter((r) => r.status === 'success').length;
    const failureCount = allRows.filter((r) => r.status === 'failed').length;
    const totalCostUsd = allRows.reduce(
      (sum, r) => sum + Number(r.total_cost_usd ?? 0),
      0,
    );

    return {
      success: true,
      data: {
        totalRuns,
        successCount,
        failureCount,
        successRate: totalRuns > 0 ? successCount / totalRuns : 0,
        avgCostUsd: totalRuns > 0 ? totalCostUsd / totalRuns : 0,
        totalCostUsd,
      },
    };
  }
}
