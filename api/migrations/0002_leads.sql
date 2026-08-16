-- Captured leads (see src/core/leads.ts). Populated when the model calls the
-- capture_lead tool with a name, project description, and at least one
-- contact method. Works in both TENANT_MODE=single and =multi — DB is bound
-- either way (see wrangler.jsonc).
CREATE TABLE IF NOT EXISTS leads (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  channel              TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  conversation_key     TEXT NOT NULL,               -- ConversationDO name — see admin.ts's /admin/conversations/:conversationId
  name                 TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  budget               TEXT,
  project_description  TEXT NOT NULL,
  asana_task_gid       TEXT,                        -- set only if the best-effort Asana push succeeded
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS leads_tenant_created_idx ON leads (tenant_id, created_at DESC);
