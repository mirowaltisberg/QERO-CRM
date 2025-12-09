-- Migration: Add driving license field to TMA candidates and Vacancies
-- Options: 'none', 'B', 'BE', 'B_car', 'BE_car'

-- Add to tma_candidates (what the candidate HAS)
ALTER TABLE tma_candidates 
ADD COLUMN IF NOT EXISTS driving_license TEXT DEFAULT NULL 
CHECK (driving_license IS NULL OR driving_license IN ('none', 'B', 'BE', 'B_car', 'BE_car'));

-- Add to vacancies (what the job REQUIRES)
ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS driving_license TEXT DEFAULT NULL 
CHECK (driving_license IS NULL OR driving_license IN ('none', 'B', 'BE', 'B_car', 'BE_car'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_tma_driving_license ON tma_candidates(driving_license) WHERE driving_license IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vacancy_driving_license ON vacancies(driving_license) WHERE driving_license IS NOT NULL;

-- Comments
COMMENT ON COLUMN tma_candidates.driving_license IS 'Driving license the candidate has: none, B, BE, B_car (B + own car), BE_car (BE + own car)';
COMMENT ON COLUMN vacancies.driving_license IS 'Driving license required for the job: none, B, BE, B_car (B + own car), BE_car (BE + own car)';
