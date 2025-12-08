-- ================================================
-- Contact Persons table for Calling tab
-- ================================================

CREATE TABLE IF NOT EXISTS contact_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT,
  mobile TEXT,
  direct_phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE contact_persons ENABLE ROW LEVEL SECURITY;

-- Everyone can view contact persons
CREATE POLICY "Anyone can view contact persons" ON contact_persons
  FOR SELECT
  USING (true);

-- Authenticated users can insert contact persons
CREATE POLICY "Authenticated can insert contact persons" ON contact_persons
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can update contact persons
CREATE POLICY "Authenticated can update contact persons" ON contact_persons
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can delete contact persons
CREATE POLICY "Authenticated can delete contact persons" ON contact_persons
  FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS contact_persons_contact_id_idx
  ON contact_persons (contact_id);
