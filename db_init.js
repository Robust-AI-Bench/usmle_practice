#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getSupabaseClient, supabaseUrl, supabaseServiceKey } = require('./db_utils');

async function initializeDatabase() {
  console.log('\nInitializing database tables...');
  
  try {
    const supabase = getSupabaseClient();
    
    // First check if tables already exist
    let questionsError = false;
    try {
      const { error } = await supabase
        .from('questions')
        .select('count(*)')
        .limit(1);
      
      questionsError = error;
    } catch (err) {
      questionsError = { message: 'Table does not exist' };
    }

    if (questionsError) {
      // Tables don't exist, we need to create them
      console.log('Tables do not exist. Creating schema...');

      // Create the SQL init file first
      const sqlFilePath = path.join(process.cwd(), 'db_init.sql');
      fs.writeFileSync(sqlFilePath, `
-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  question_id SERIAL PRIMARY KEY,
  question_set TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  answer TEXT NOT NULL,
  answer_idx TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  meta_info TEXT,
  answer_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_question_set ON questions(question_set);
CREATE INDEX IF NOT EXISTS idx_questions_question_hash ON questions(question_hash);

-- User answers table
CREATE TABLE IF NOT EXISTS user_answers (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(question_id),
  question_hash TEXT NOT NULL,
  question_set TEXT NOT NULL,
  selected_option TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_answers_user_id ON user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON user_answers(question_id);

-- Question flags table
CREATE TABLE IF NOT EXISTS question_flags (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(question_id),
  question_hash TEXT NOT NULL,
  question_set TEXT NOT NULL,
  flag_reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_flags_question_id ON question_flags(question_id);

-- User fingerprints table
CREATE TABLE IF NOT EXISTS user_fingerprints (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  ip_info_io JSONB,
  named TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_fingerprints_fingerprint ON user_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_fingerprints_user_id ON user_fingerprints(user_id);

-- Configuration table
CREATE TABLE IF NOT EXISTS configuration (
  id INTEGER PRIMARY KEY,
  question_sets JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on configuration table
ALTER TABLE configuration ENABLE ROW LEVEL SECURITY;

-- Create policy for public access to configuration
CREATE POLICY "allow_select_config" 
ON "public"."configuration"
FOR SELECT
TO public
USING (true);

-- Enable Row Level Security on questions table
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Create policy for public access to questions
CREATE POLICY "allow_select_questions" 
ON "public"."questions"
FOR SELECT
TO public
USING (true);

-- Enable Row Level Security on user_answers table
ALTER TABLE user_answers ENABLE ROW LEVEL SECURITY;

-- Create policy for inserting answers
CREATE POLICY "allow_insert_answers"
ON "public"."user_answers"
FOR INSERT
TO public
WITH CHECK (true);

-- Enable Row Level Security on question_flags table
ALTER TABLE question_flags ENABLE ROW LEVEL SECURITY;

-- Create policy for inserting flags
CREATE POLICY "allow_insert_flags"
ON "public"."question_flags"
FOR INSERT
TO public
WITH CHECK (true);

-- Create trigger function for updating answer count
CREATE OR REPLACE FUNCTION update_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE questions
  SET answer_count = answer_count + 1
  WHERE question_id = NEW.question_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_answer_count ON user_answers;

CREATE TRIGGER trigger_update_answer_count
AFTER INSERT ON user_answers
FOR EACH ROW
EXECUTE FUNCTION update_answer_count();

-- Insert default configuration
INSERT INTO configuration (id, question_sets)
VALUES (1, '[
  {"name": "medQA", "percentage": 50, "max_answers": null},
  {"name": "synthNew", "percentage": 50, "max_answers": 5}
]'::jsonb)
ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Created SQL initialization file at:', sqlFilePath);
      console.log('\nYou have two options to initialize the database:');
      console.log('\nOption 1: Use the Supabase Dashboard');
      console.log('1. Go to your Supabase project dashboard at:', supabaseUrl);
      console.log('2. Click on "SQL Editor"');
      console.log('3. Create a new query and paste the contents of db_init.sql');
      console.log('4. Run the SQL query to initialize the tables');
      
      console.log('\nOption 2: Use the Supabase API');
      console.log('1. Try to run db:init again with your Supabase service role key');
      console.log('2. If that fails, contact Supabase support or check your project permissions');
      
      // Try one more approach with the REST API
      const executeSQL = async () => {
        const sqlEndpoint = `${supabaseUrl}/rest/v1/sql`;
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        const response = await fetch(sqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Prefer': 'params=single-object'
          },
          body: JSON.stringify({
            query: sqlContent
          })
        });
        
        if (response.ok) {
          return { success: true };
        } else {
          const errorText = await response.text();
          return { 
            success: false, 
            status: response.status,
            text: errorText
          };
        }
      };
      
      console.log('\nAttempting to initialize tables directly...');
      const result = await executeSQL();
      
      if (result.success) {
        console.log('Database tables initialized successfully!');
      } else {
        console.error('Failed to initialize tables directly:', result.status);
        console.log('Please use one of the options above to initialize your database.');
      }
    } else {
      console.log('Tables already exist. Database is ready.');
    }
  } catch (error) {
    console.error('Error during database initialization:', error.message);
  }
}

// If this script is run directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Initialization complete.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase }; 