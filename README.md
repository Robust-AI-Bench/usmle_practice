# USMLE Practice App

A simple web application for medical students to practice USMLE exam questions.

## Features

- Multiple-choice questions from a Supabase database
- Immediate feedback on answers
- Ability to flag questions with issues
- Anonymous user tracking
- Automatic question loading to minimize wait times

## Tech Stack

- HTML5, CSS, and vanilla JavaScript
- Bootstrap for styling
- Supabase for database and authentication
- Node.js CLI for database administration

## Setup

1. Clone this repository
2. Create a `.env` file with the following variables:
   ```
   postgres_password=your_postgres_password
   supabase_server=your_supabase_url
   supabase_anon_key=your_supabase_anon_key
   supabase_service_key=your_supabase_service_role_key
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Initialize the database:
   ```
   npm run db:init
   ```
   This will try to create the necessary tables. If it fails, you can:
   - Use the generated `db_init.sql` file in Supabase's SQL Editor
   - Ensure your Supabase service role key has the necessary permissions

5. Upload questions:
   ```
   npm run db:init
   ```
   Then select option 2 and follow the prompts to upload questions from a JSON or JSONL file.

6. Start the web server:
   ```
   npm start
   ```

## Database CLI Usage

The database CLI has been split into separate commands:

1. Initialize database tables:
   ```
   npm run db:init
   ```

2. Upload questions from a file (JSON or JSONL):
   ```
   npm run db:upload
   ```

3. Show current configuration:
   ```
   npm run db:config
   ```

4. Update configuration:
   ```
   npm run db:update-config
   ```

Each command can also be run directly:
```
node db_init.js
node db_upload_questions.js
node db_show_config.js
node db_update_config.js
```

## Question Format

Questions should be in JSON or JSONL format with the following structure:

```json
{
  "question": "A previously healthy 28-year-old man comes to the emergency department because of dizziness and palpitations for 2 days. Prior to the onset of the symptoms, he attended a bachelor party where he lost several drinking games. An ECG is shown. Which of the following is the most likely diagnosis?",
  "answer": "Paroxysmal atrial fibrillation",
  "options": {
    "A": "Hypertrophic obstructive cardiomoyopathy",
    "B": "Paroxysmal atrial fibrillation",
    "C": "Brugada syndrome",
    "D": "Ventricular tachycardia",
    "E": "Sick sinus syndrome"
  },
  "meta_info": "step1",
  "answer_idx": "B"
}
```

## Database Structure

- **questions**: Stores all questions with their options and correct answers
- **user_answers**: Records user answers for each question
- **question_flags**: Stores flags submitted by users for problematic questions
- **user_fingerprints**: Stores user identification data for tracking, including fingerprint hash, IP information from ipinfo.io, and user agent
- **configuration**: Stores app configuration, including question set percentages 