-- Create table for storing cached email drafts between candidates and companies
CREATE TABLE IF NOT EXISTS candidate_company_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES tma_candidates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Standard draft (generated without web research)
  standard_body TEXT,
  standard_subject TEXT,
  standard_updated_at TIMESTAMPTZ,
  
  -- Best draft (generated with web research)
  best_body TEXT,
  best_subject TEXT,
  best_updated_at TIMESTAMPTZ,
  best_research_summary JSONB,
  best_research_confidence TEXT CHECK (best_research_confidence IN ('high', 'medium', 'low')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint on candidate + company pair
  UNIQUE(candidate_id, company_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_drafts_candidate_company 
  ON candidate_company_email_drafts(candidate_id, company_id);

-- Enable RLS
ALTER TABLE candidate_company_email_drafts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage drafts
CREATE POLICY "Authenticated users can manage email drafts" ON candidate_company_email_drafts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_email_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_email_drafts_updated_at
  BEFORE UPDATE ON candidate_company_email_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_email_drafts_updated_at();










