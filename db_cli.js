#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const readline = require('readline');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables from .env file
dotenv.config();

// Supabase credentials from env
const supabaseUrl = process.env.supabase_server;
const supabaseServiceKey = process.env.supabase_service_key;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Supabase credentials not found in environment variables.');
  console.error('Make sure you have a .env file with supabase_server and supabase_service_key defined.');
  process.exit(1);
}

// Initialize Supabase client with service role key (admin access)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main menu
function showMenu() {
  console.log('\n=== USMLE Practice Database CLI ===');
  console.log('1. Initialize database tables');
  console.log('2. Upload questions from file');
  console.log('3. Show configuration');
  console.log('4. Update configuration');
  console.log('5. Exit');
  
  rl.question('\nSelect an option (1-5): ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await initializeDatabase();
        showMenu();
        break;
      case '2':
        await uploadQuestionsPrompt();
        showMenu();
        break;
      case '3':
        await showConfiguration();
        showMenu();
        break;
      case '4':
        await updateConfiguration();
        showMenu();
        break;
      case '5':
        console.log('Exiting...');
        rl.close();
        break;
      default:
        console.log('Invalid option. Please try again.');
        showMenu();
    }
  });
}

// Initialize database tables
async function initializeDatabase() {
  console.log('\nInitializing database tables...');
  
  try {
    // First check if tables already exist
    const { error: questionsError } = await supabase
      .from('questions')
      .select('count(*)')
      .limit(1)
      .catch(() => ({ error: { message: 'Table does not exist' } }));

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

// Upload questions from file
async function uploadQuestionsPrompt() {
  rl.question('\nEnter the path to the questions file (JSONL or JSON): ', (filePath) => {
    rl.question('Enter the question set name: ', async (questionSet) => {
      try {
        await uploadQuestions(filePath, questionSet);
      } catch (error) {
        console.error('Error uploading questions:', error.message);
      }
    });
  });
}

async function uploadQuestions(filePath, questionSet) {
  console.log(`\nUploading questions from ${filePath} to the '${questionSet}' question set...`);
  
  try {
    // Read file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let questions = [];
    
    // Parse file based on extension
    const extension = path.extname(filePath).toLowerCase();
    
    if (extension === '.jsonl') {
      // Parse JSONL (one JSON object per line)
      questions = fileContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } else if (extension === '.json') {
      // Parse JSON (single array or object)
      const parsed = JSON.parse(fileContent);
      questions = Array.isArray(parsed) ? parsed : [parsed];
    } else if (extension === '.csv') {
      console.error('CSV format not yet supported. Please use JSON or JSONL format.');
      return;
    } else {
      console.error('Unsupported file format. Please use JSON or JSONL format.');
      return;
    }
    
    console.log(`Found ${questions.length} questions to upload.`);
    
    // Process questions in batches of 100
    const batchSize = 100;
    let processed = 0;
    
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      const processedBatch = batch.map(q => {
        // Create SHA-256 hash of the question text to detect duplicates
        const questionData = q.question + JSON.stringify(q.options) + q.answer;
        const questionHash = crypto.createHash('sha256').update(questionData).digest('hex');
        
        return {
          question_set: questionSet,
          question: q.question,
          options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
          answer: q.answer,
          answer_idx: q.answer_idx,
          question_hash: questionHash,
          meta_info: q.meta_info || null,
          answer_count: 0
        };
      });
      
      const { error } = await supabase.from('questions').insert(processedBatch);
      
      if (error) {
        throw error;
      }
      
      processed += batch.length;
      console.log(`Processed ${processed}/${questions.length} questions...`);
    }
    
    console.log(`Successfully uploaded ${processed} questions to the '${questionSet}' question set!`);
  } catch (error) {
    console.error('Error uploading questions:', error.message);
  }
}

// Show current configuration
async function showConfiguration() {
  try {
    const { data, error } = await supabase
      .from('configuration')
      .select('*')
      .limit(1)
      .single();
    
    if (error) throw error;
    
    console.log('\nCurrent Configuration:');
    console.log(JSON.stringify(data.question_sets, null, 2));
  } catch (error) {
    console.error('Error retrieving configuration:', error.message);
  }
}

// Update configuration
async function updateConfiguration() {
  try {
    // First get the current configuration
    const { data: currentConfig, error: getError } = await supabase
      .from('configuration')
      .select('*')
      .limit(1)
      .single();
    
    if (getError) throw getError;
    
    console.log('\nCurrent question sets:');
    console.log(JSON.stringify(currentConfig.question_sets, null, 2));
    
    rl.question('\nEnter the new configuration as JSON (press Enter to keep current): ', async (input) => {
      if (!input.trim()) {
        console.log('Configuration unchanged.');
        return;
      }
      
      try {
        const newConfig = JSON.parse(input);
        
        // Validate the configuration
        if (!Array.isArray(newConfig)) {
          throw new Error('Configuration must be an array of question sets');
        }
        
        // Ensure each set has required properties
        for (const set of newConfig) {
          if (!set.name || typeof set.percentage !== 'number') {
            throw new Error('Each question set must have a name and percentage');
          }
          
          // Ensure percentages sum to 100
          const totalPercentage = newConfig.reduce((sum, set) => sum + set.percentage, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error(`Percentages must sum to 100, got ${totalPercentage}`);
          }
        }
        
        // Update the configuration
        const { error: updateError } = await supabase
          .from('configuration')
          .update({ question_sets: newConfig, updated_at: new Date() })
          .eq('id', 1);
        
        if (updateError) throw updateError;
        
        console.log('Configuration updated successfully!');
      } catch (error) {
        console.error('Error updating configuration:', error.message);
      }
    });
  } catch (error) {
    console.error('Error retrieving current configuration:', error.message);
  }
}

// Start the CLI
console.log('USMLE Practice Database CLI');
showMenu(); 