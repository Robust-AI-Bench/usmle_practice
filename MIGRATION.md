# Database Migration Guide

This guide explains the changes made to the database schema and how to migrate your existing database.

## New Columns

The following columns have been added to the `questions` table:

1. **extraJ (JSONB)**: Stores file metadata from the upload process
2. **other (JSONB)**: Stores additional data if present in the input file
3. **overflow (JSONB)**: Captures any unmapped fields from the input data that don't match our schema

## Why These Changes?

- **extraJ**: Provides provenance tracking for uploaded questions
- **other**: Allows for structured additional data to be included with questions
- **overflow**: Ensures no data is lost during import, even if it doesn't match our schema

## How to Migrate

If you have an existing database, you need to run the migration script to add these columns.

### Using Supabase Dashboard:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `db_migration.sql`
4. Execute the script

### Using Command Line:

```bash
psql -h <your-host> -U <your-username> -d <your-database> -f db_migration.sql
```

### Using Node.js:

```javascript
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    const sql = fs.readFileSync('db_migration.sql', 'utf8');
    await pool.query(sql);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
```

## Usage in Upload Script

The upload script (`upload.js`, formerly `db_upload_questions.js`) has been updated to:

1. Include file metadata in the `extraJ` column
2. Copy any `other` field from the input directly to the `other` column
3. Collect any unmapped fields into the `overflow` column

This ensures that all data from input files is preserved, even if it doesn't directly map to our database schema. 