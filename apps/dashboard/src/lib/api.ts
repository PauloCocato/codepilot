import { fetchRuns as fetchRunsFromData, fetchRunById, fetchStats as fetchStatsFromData } from './data';
import type { Run } from './mock-data';
import type { DashboardStats } from './data';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Fetch stats from the data layer (Supabase or mock fallback).
 */
export async function fetchStats(): Promise<DashboardStats> {
  return fetchStatsFromData();
}

/**
 * Fetch all runs from the data layer.
 */
export async function fetchRuns(): Promise<readonly Run[]> {
  const { runs } = await fetchRunsFromData(50, 0);
  return runs;
}

/**
 * Fetch a single run by ID.
 */
export async function fetchRun(id: string): Promise<Run | undefined> {
  const run = await fetchRunById(id);
  return run ?? undefined;
}

/**
 * Trigger resolution of a GitHub issue.
 * Still requires the agent API — not yet connected to Supabase.
 */
export async function resolveIssue(issueUrl: string): Promise<Run> {
  const res = await fetch(`${BASE_URL}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issueUrl }),
  });
  if (!res.ok) throw new Error(`Failed to resolve issue: ${res.statusText}`);
  return res.json() as Promise<Run>;
}
