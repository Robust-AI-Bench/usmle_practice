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
  extraJ JSONB,
  other JSONB,
  overflow JSONB,
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
      