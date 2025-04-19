#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { getSupabaseClient } = require('./db_utils');

// CLI interface
let rl;
function createInterface() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

async function uploadQuestionsPrompt() {
  const rl = createInterface();
  
  return new Promise((resolve) => {
    rl.question('\nEnter the path to the questions file (JSONL or JSON): ', (filePath) => {
      rl.question('Enter the question set name: ', async (questionSet) => {
        try {
          await uploadQuestions(filePath, questionSet);
          resolve();
        } catch (error) {
          console.error('Error uploading questions:', error.message);
          resolve();
        }
      });
    });
  });
}

async function uploadQuestions(filePath, questionSet) {
  console.log(`\nUploading questions from ${filePath} to the '${questionSet}' question set...`);
  
  try {
    const supabase = getSupabaseClient();
    
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
      
      try {
        const { error } = await supabase.from('questions').insert(processedBatch);
        
        if (error) {
          throw error;
        }
        
        processed += batch.length;
        console.log(`Processed ${processed}/${questions.length} questions...`);
      } catch (error) {
        console.error(`Error uploading batch (${i+1}-${i+Math.min(batch.length, batchSize)}):`, error.message);
        throw error;
      }
    }
    
    console.log(`Successfully uploaded ${processed} questions to the '${questionSet}' question set!`);
  } catch (error) {
    console.error('Error uploading questions:', error.message);
    throw error;
  }
}

// If this script is run directly
if (require.main === module) {
  uploadQuestionsPrompt()
    .then(() => {
      if (rl) rl.close();
      console.log('Upload process complete.');
      process.exit(0);
    })
    .catch(error => {
      if (rl) rl.close();
      console.error('Upload process failed:', error);
      process.exit(1);
    });
}

module.exports = { uploadQuestions, uploadQuestionsPrompt }; 