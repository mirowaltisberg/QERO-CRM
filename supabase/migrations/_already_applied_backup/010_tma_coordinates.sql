-- ================================================
-- Add latitude/longitude columns to tma_candidates
-- for radius-based location search
-- ================================================

-- Add coordinate columns
ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Index for bounding box queries (used before Haversine calculation)
CREATE INDEX IF NOT EXISTS idx_tma_candidates_lat ON tma_candidates(latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tma_candidates_lng ON tma_candidates(longitude) WHERE longitude IS NOT NULL;

-- Composite index for coordinate lookups
CREATE INDEX IF NOT EXISTS idx_tma_candidates_coords ON tma_candidates(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ================================================
-- Helper function to calculate Haversine distance
-- ================================================
CREATE OR REPLACE FUNCTION haversine_distance(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  earth_radius_km CONSTANT DOUBLE PRECISION := 6371;
  dlat DOUBLE PRECISION;
  dlng DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN earth_radius_km * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================================
-- Function to search candidates within radius
-- ================================================
CREATE OR REPLACE FUNCTION search_tma_within_radius(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION,
  team_uuid UUID
) RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  canton TEXT,
  city TEXT,
  street TEXT,
  postal_code TEXT,
  status TEXT,
  activity TEXT,
  position_title TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
) AS $$
DECLARE
  lat_delta DOUBLE PRECISION;
  lng_delta DOUBLE PRECISION;
BEGIN
  -- Calculate bounding box for initial filter
  lat_delta := radius_km / 111.32;
  lng_delta := radius_km / (111.32 * cos(radians(center_lat)));
  
  RETURN QUERY
  SELECT 
    t.id,
    t.first_name,
    t.last_name,
    t.phone,
    t.email,
    t.canton,
    t.city,
    t.street,
    t.postal_code,
    t.status,
    t.activity,
    t.position_title,
    t.latitude,
    t.longitude,
    haversine_distance(center_lat, center_lng, t.latitude, t.longitude) AS distance_km
  FROM tma_candidates t
  WHERE t.team_id = team_uuid
    AND t.latitude IS NOT NULL
    AND t.longitude IS NOT NULL
    -- Bounding box filter (fast)
    AND t.latitude BETWEEN (center_lat - lat_delta) AND (center_lat + lat_delta)
    AND t.longitude BETWEEN (center_lng - lng_delta) AND (center_lng + lng_delta)
    -- Haversine filter (accurate)
    AND haversine_distance(center_lat, center_lng, t.latitude, t.longitude) <= radius_km
  ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql STABLE;

