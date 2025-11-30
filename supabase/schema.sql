-- ================================================
-- QERO CRM Database Schema
-- For Supabase PostgreSQL
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- CONTACTS TABLE
-- Main table for storing contact information
-- ================================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  canton TEXT,
  status TEXT DEFAULT NULL CHECK (
    status IS NULL OR status IN (
      'hot',
      'working',
      'follow_up'
    )
  ),
  follow_up_at TIMESTAMPTZ,
  follow_up_note TEXT,
  last_call TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_canton ON contacts(canton);
CREATE INDEX idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX idx_contacts_last_call ON contacts(last_call DESC);
CREATE INDEX idx_contacts_follow_up_at ON contacts(follow_up_at);

-- ================================================
-- TMA CANDIDATES TABLE
-- Separate dataset for talents/employees (TMA Mode)
-- ================================================
CREATE TABLE tma_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  canton TEXT,
  status TEXT DEFAULT NULL CHECK (
    status IS NULL OR status IN ('A', 'B', 'C')
  ),
  notes TEXT,
  follow_up_at TIMESTAMPTZ,
  follow_up_note TEXT,
  cv_url TEXT,
  references_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tma_status ON tma_candidates(status);
CREATE INDEX idx_tma_canton ON tma_candidates(canton);
CREATE INDEX idx_tma_created_at ON tma_candidates(created_at DESC);
CREATE INDEX idx_tma_follow_up_at ON tma_candidates(follow_up_at);

-- Full-text search index for company and contact names
CREATE INDEX idx_contacts_search ON contacts 
  USING GIN (to_tsvector('english', company_name || ' ' || contact_name || ' ' || COALESCE(email, '')));

-- ================================================
-- CALL_LOGS TABLE
-- Records of all calls made
-- ================================================
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'no_answer', 
    'interested', 
    'follow_up', 
    'wrong_number', 
    'meeting_set', 
    'not_interested'
  )),
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call logs
CREATE INDEX idx_call_logs_contact ON call_logs(contact_id);
CREATE INDEX idx_call_logs_timestamp ON call_logs(timestamp DESC);
CREATE INDEX idx_call_logs_outcome ON call_logs(outcome);

-- ================================================
-- LISTS TABLE
-- Named collections of contacts
-- ================================================
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lists
CREATE INDEX idx_lists_created_at ON lists(created_at DESC);

-- ================================================
-- LIST_MEMBERS TABLE
-- Junction table linking contacts to lists
-- ================================================
CREATE TABLE list_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, contact_id)
);

-- Indexes for list members
CREATE INDEX idx_list_members_list ON list_members(list_id);
CREATE INDEX idx_list_members_contact ON list_members(contact_id);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable when authentication is added
-- ================================================

-- For now, RLS is disabled to allow public access
-- Uncomment these when adding authentication:

-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (customize based on your auth needs):
-- CREATE POLICY "Users can view their own contacts" ON contacts
--   FOR SELECT USING (auth.uid() = user_id);

-- ================================================
-- STORAGE BUCKETS
-- ================================================
-- SELECT storage.create_bucket('tma-docs', '{"public": true}');

-- ================================================
-- USEFUL VIEWS
-- ================================================

-- View: Contacts with call count
CREATE OR REPLACE VIEW contacts_with_stats AS
SELECT 
  c.*,
  COUNT(cl.id) as call_count,
  MAX(cl.timestamp) as latest_call
FROM contacts c
LEFT JOIN call_logs cl ON c.id = cl.contact_id
GROUP BY c.id;

-- View: List with contact count
CREATE OR REPLACE VIEW lists_with_counts AS
SELECT 
  l.*,
  COUNT(lm.id) as contact_count
FROM lists l
LEFT JOIN list_members lm ON l.id = lm.list_id
GROUP BY l.id;

-- ================================================
-- FUNCTIONS
-- ================================================

-- Function: Get dashboard stats
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'calls_today', (
      SELECT COUNT(*) FROM call_logs 
      WHERE timestamp >= CURRENT_DATE
    ),
    'calls_this_week', (
      SELECT COUNT(*) FROM call_logs 
      WHERE timestamp >= date_trunc('week', CURRENT_DATE)
    ),
    'follow_ups_due', (
      SELECT COUNT(*) FROM contacts 
      WHERE status = 'follow_up'
        AND (
          follow_up_at IS NULL
          OR follow_up_at <= NOW()
        )
    ),
    'total_contacts', (
      SELECT COUNT(*) FROM contacts
    ),
    'conversion_rate', (
      SELECT ROUND(
        (COUNT(*) FILTER (WHERE outcome IN ('interested', 'meeting_set'))::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100), 
        1
      ) FROM call_logs
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

