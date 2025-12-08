-- TMA roles table for color-coded role presets
CREATE TABLE IF NOT EXISTS tma_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4B5563',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  slug TEXT GENERATED ALWAYS AS (
    regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
  ) STORED
);

ALTER TABLE tma_roles
  ADD CONSTRAINT tma_roles_team_slug_key UNIQUE (team_id, slug);

-- Seed initial roles from existing candidate position titles
WITH distinct_roles AS (
  SELECT
    COALESCE(team_id, '00000000-0000-0000-0000-000000000010') AS team_id,
    trim(position_title) AS name
  FROM tma_candidates
  WHERE position_title IS NOT NULL
    AND length(trim(position_title)) > 0
  GROUP BY COALESCE(team_id, '00000000-0000-0000-0000-000000000010'), trim(position_title)
)
INSERT INTO tma_roles (team_id, name, color)
SELECT team_id, name, '#4B5563'
FROM distinct_roles
ON CONFLICT ON CONSTRAINT tma_roles_team_slug_key DO NOTHING;

