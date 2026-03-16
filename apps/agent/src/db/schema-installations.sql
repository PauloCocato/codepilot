CREATE TABLE IF NOT EXISTS installations (
  id BIGINT PRIMARY KEY,  -- GitHub installation ID
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,  -- User or Organization
  repository_selection TEXT,  -- all or selected
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  issue_number INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  cost_usd NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_installation_created ON usage_records(installation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
