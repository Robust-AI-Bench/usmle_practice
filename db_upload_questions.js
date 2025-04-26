#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { getSupabaseClient } = require('./db_utils');

// Parse command line arguments
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Check for help flag
  if (args.includes('-h') || args.includes('--help')) {
    showHelpAndExit();
  }
  
  // Look for -f or --file argument
  const fileArgIndex = args.findIndex(arg => arg === '-f' || arg === '--file');
  if (fileArgIndex !== -1 && args.length > fileArgIndex + 1) {
    options.filePath = args[fileArgIndex + 1];
  }
  
  // Look for -s or --set argument
  const setArgIndex = args.findIndex(arg => arg === '-s' || arg === '--set');
  if (setArgIndex !== -1 && args.length > setArgIndex + 1) {
    options.questionSet = args[setArgIndex + 1];
  }
  
  // Return parsed options
  return options;
}

// Show help message and exit
function showHelpAndExit() {
  console.log(`
Usage: node db_upload_questions.js [options]

Options:
  -f, --file <path>    Path to the questions file (JSONL or JSON)
  -s, --set <name>     Question set name
  -h, --help           Show this help message

Examples:
  node db_upload_questions.js -f ./questions.json -s medQA
  node db_upload_questions.js --file ./step1.jsonl --set step1
  
If no arguments are provided, the script will run in interactive mode.
  `);
  process.exit(0);
}

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
    
    // Get file metadata
    const fileMetadata = getFileMetadata(filePath);
    console.log('File metadata:', fileMetadata);
    
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
          options: typeof q.options === 'object' ? q.options : JSON.parse(q.options),
          answer: q.answer,
          answer_idx: q.answer_idx,
          question_hash: questionHash,
          meta_info: q.meta_info || null,
          answer_count: 0,
          extraJ: fileMetadata // Pass object directly, not stringified
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

/**
 * Get metadata for a file including name, size, and hash
 * @param {string} filePath - Path to the file
 * @returns {Object} File metadata object
 */
function getFileMetadata(filePath) {
  // Get absolute file path
  const absolutePath = path.resolve(filePath);
  
  // Extract filename from path
  const filename = path.basename(absolutePath);
  
  // Get file stats
  const stats = fs.statSync(absolutePath);
  const sizeInBytes = stats.size;
  
  // Generate SHA256 hash of the raw file
  const fileBuffer = fs.readFileSync(absolutePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  
  return {
    filename,
    size: sizeInBytes,
    sizeFormatted: formatFileSize(sizeInBytes),
    sha256: fileHash,
    uploadedAt: new Date().toISOString(),
    sourcePath: absolutePath
  };
}

/**
 * Format file size to human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Main execution logic
async function main() {
  try {
    // Check for command line arguments first
    const args = parseCommandLineArgs();
    
    if (args.filePath && args.questionSet) {
      // Use command line arguments
      await uploadQuestions(args.filePath, args.questionSet);
    } else {
      // Fall back to interactive prompt
      await uploadQuestionsPrompt();
    }
    
    if (rl) rl.close();
    console.log('Upload process complete.');
    process.exit(0);
  } catch (error) {
    if (rl) rl.close();
    console.error('Upload process failed:', error);
    process.exit(1);
  }
}

// If this script is run directly
if (require.main === module) {
  main();
}

module.exports = { uploadQuestions, uploadQuestionsPrompt }; 