-- CodePilot database schema
-- Run against your Supabase PostgreSQL instance

-- ── Agent runs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issue_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending, running, success, failed
  triggered_by TEXT NOT NULL DEFAULT 'webhook',  -- webhook, manual, api
  patch TEXT,
  explanation TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  safety_score INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Agent run steps (timeline) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,                       -- parse, clone, index, search, plan, generate, test, critic, submit
  status TEXT NOT NULL DEFAULT 'pending',         -- pending, running, success, failed, skipped
  duration_ms INTEGER,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── LLM usage tracking ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                        -- claude, openai
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(10,6) NOT NULL,
  latency_ms INTEGER NOT NULL,
  purpose TEXT,                                  -- plan, generate, critic, search
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_runs_repo ON agent_runs(repo_owner, repo_name);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON agent_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_run_id ON llm_usage(run_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage(provider);

-- ── Auto-update updated_at trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_agent_runs_updated_at ON agent_runs;
CREATE TRIGGER trigger_agent_runs_updated_at
  BEFORE UPDATE ON agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
