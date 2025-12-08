-- Vacancies (Job Offers) Feature
-- Companies post job openings with criteria, system suggests matching TMA candidates

-- Main vacancies table
CREATE TABLE IF NOT EXISTS vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,  -- Link to company
  title TEXT NOT NULL,                    -- "Elektroinstallateur EFZ"
  role TEXT,                              -- For TMA matching (matches tma_candidates.role)
  description TEXT,
  city TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  radius_km INTEGER DEFAULT 25,           -- Search radius for candidates
  min_quality TEXT CHECK (min_quality IN ('A', 'B', 'C')),  -- Minimum quality requirement
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'interviewing', 'filled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track assigned/matched candidates for each vacancy
CREATE TABLE IF NOT EXISTS vacancy_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID REFERENCES vacancies(id) ON DELETE CASCADE,
  tma_id UUID REFERENCES tma_candidates(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'suggested' CHECK (status IN ('suggested', 'contacted', 'interviewing', 'rejected', 'hired')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vacancy_id, tma_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_contact ON vacancies(contact_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_created_by ON vacancies(created_by);
CREATE INDEX IF NOT EXISTS idx_vacancy_candidates_vacancy ON vacancy_candidates(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_candidates_tma ON vacancy_candidates(tma_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_candidates_status ON vacancy_candidates(status);

-- RLS Policies (global visibility - all authenticated users can see all vacancies)
ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacancy_candidates ENABLE ROW LEVEL SECURITY;

-- Vacancies: All authenticated users can view
CREATE POLICY "vacancies_select" ON vacancies
  FOR SELECT TO authenticated USING (true);

-- Vacancies: All authenticated users can insert
CREATE POLICY "vacancies_insert" ON vacancies
  FOR INSERT TO authenticated WITH CHECK (true);

-- Vacancies: All authenticated users can update
CREATE POLICY "vacancies_update" ON vacancies
  FOR UPDATE TO authenticated USING (true);

-- Vacancies: All authenticated users can delete
CREATE POLICY "vacancies_delete" ON vacancies
  FOR DELETE TO authenticated USING (true);

-- Vacancy candidates: All authenticated users can view
CREATE POLICY "vacancy_candidates_select" ON vacancy_candidates
  FOR SELECT TO authenticated USING (true);

-- Vacancy candidates: All authenticated users can insert
CREATE POLICY "vacancy_candidates_insert" ON vacancy_candidates
  FOR INSERT TO authenticated WITH CHECK (true);

-- Vacancy candidates: All authenticated users can update
CREATE POLICY "vacancy_candidates_update" ON vacancy_candidates
  FOR UPDATE TO authenticated USING (true);

-- Vacancy candidates: All authenticated users can delete
CREATE POLICY "vacancy_candidates_delete" ON vacancy_candidates
  FOR DELETE TO authenticated USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_vacancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vacancies_updated_at
  BEFORE UPDATE ON vacancies
  FOR EACH ROW
  EXECUTE FUNCTION update_vacancy_updated_at();

CREATE TRIGGER vacancy_candidates_updated_at
  BEFORE UPDATE ON vacancy_candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_vacancy_updated_at();
