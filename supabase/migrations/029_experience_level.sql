-- Add experience level to TMA candidates and vacancies
-- Options: less_than_1, more_than_1, more_than_3

-- Add experience_level to tma_candidates
ALTER TABLE tma_candidates 
ADD COLUMN IF NOT EXISTS experience_level TEXT;

-- Add min_experience to vacancies (minimum experience required)
ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS min_experience TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tma_candidates.experience_level IS 'Work experience level: less_than_1, more_than_1, more_than_3';
COMMENT ON COLUMN vacancies.min_experience IS 'Minimum experience required: less_than_1, more_than_1, more_than_3';
