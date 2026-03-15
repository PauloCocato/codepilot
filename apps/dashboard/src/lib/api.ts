import { MOCK_RUNS, MOCK_STATS } from './mock-data';
import type { Run, Stats } from './mock-data';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Fetch stats from the agent API.
 * Currently returns mock data — real integration coming later.
 */
export async function fetchStats(): Promise<Stats> {
  // TODO: replace with real API call
  // const res = await fetch(`${BASE_URL}/api/stats`);
  // if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  // return res.json();
  void BASE_URL;
  return Promise.resolve(MOCK_STATS);
}

/**
 * Fetch all runs from the agent API.
 * Currently returns mock data.
 */
export async function fetchRuns(): Promise<readonly Run[]> {
  // TODO: replace with real API call
  void BASE_URL;
  return Promise.resolve(MOCK_RUNS);
}

/**
 * Fetch a single run by ID.
 * Currently returns mock data.
 */
export async function fetchRun(id: string): Promise<Run | undefined> {
  // TODO: replace with real API call
  // const res = await fetch(`${BASE_URL}/api/runs/${id}`);
  void BASE_URL;
  const run = MOCK_RUNS.find((r) => r.id === id);
  return Promise.resolve(run);
}

/**
 * Trigger resolution of a GitHub issue.
 * Currently returns mock data.
 */
export async function resolveIssue(issueUrl: string): Promise<Run> {
  // TODO: replace with real API call
  // const res = await fetch(`${BASE_URL}/api/resolve`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ issueUrl }),
  // });
  // if (!res.ok) throw new Error(`Failed to resolve issue: ${res.statusText}`);
  // return res.json();
  void BASE_URL;
  void issueUrl;
  return Promise.resolve(MOCK_RUNS[0]);
}
