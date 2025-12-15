-- Migration: Add table for storing PDF annotations (drawings, text notes)
-- Annotations are stored per TMA candidate and document type
-- These are for viewing only - never sent with emails

CREATE TABLE IF NOT EXISTS tma_document_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tma_candidate_id uuid NOT NULL REFERENCES tma_candidates(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('short_profile')),
  annotations jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id),
  UNIQUE (tma_candidate_id, document_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tma_document_annotations_candidate 
  ON tma_document_annotations(tma_candidate_id);

-- Enable RLS
ALTER TABLE tma_document_annotations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated users can read and write annotations
-- (annotations are shared across team, not personal)
CREATE POLICY "Authenticated users can read annotations"
  ON tma_document_annotations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert annotations"
  ON tma_document_annotations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update annotations"
  ON tma_document_annotations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete annotations"
  ON tma_document_annotations FOR DELETE
  TO authenticated
  USING (true);

-- Comment on table
COMMENT ON TABLE tma_document_annotations IS 'Stores drawing and text annotations for TMA documents (view-only, not sent with emails)';
COMMENT ON COLUMN tma_document_annotations.annotations IS 'JSON array of annotation objects: {type, paths/text, color, etc.}';
