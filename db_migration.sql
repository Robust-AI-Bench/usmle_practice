-- Migration script to add new columns to questions table

-- Add extraJ column if it doesn't exist
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS extraJ JSONB;

-- Add other column if it doesn't exist
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS other JSONB;

-- Add overflow column if it doesn't exist
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS overflow JSONB;

-- Note: Run this script on your existing database to add the new columns
-- You can run this with: 
--   psql -h <host> -U <username> -d <database> -f db_migration.sql
-- Or through the Supabase dashboard SQL editor 