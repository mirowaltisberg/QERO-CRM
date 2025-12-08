-- Add urgency level to vacancies
-- 1 = Kann warten (can wait)
-- 2 = Bald (soon)
-- 3 = Sofort (immediately)

ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS urgency INTEGER DEFAULT 1 
CHECK (urgency IN (1, 2, 3));

-- Create index for filtering by urgency
CREATE INDEX IF NOT EXISTS idx_vacancies_urgency ON vacancies(urgency);
