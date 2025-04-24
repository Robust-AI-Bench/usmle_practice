/**
 * Common utility functions shared between browser_upload.js and upload.js
 */

// Format file size to human readable format
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Ensures the Supabase client is properly authenticated
 * @returns {Object} The authenticated Supabase client or throws an error
 */
function getAuthenticatedSupabaseClient() {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Make sure client exists
    if (!window.supabaseClient) {
      throw new Error("Supabase client is not initialized");
    }

    // If the supabase client already exists, return it
    return window.supabaseClient;
  } 
  // Node.js environment
  else if (typeof require !== 'undefined') {
    const { getSupabaseClient } = require('./db_utils');
    return getSupabaseClient();
  }

  throw new Error('Unable to initialize Supabase client - unknown environment');
}

/**
 * Ensures the Supabase client is authenticated and ready for data operations
 * @returns {Promise<Object>} The authenticated Supabase client
 */
async function ensureAuthenticatedClient() {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Get the supabaseClient from window
    const client = window.supabaseClient;
    
    if (!client) {
      throw new Error("Supabase client not initialized");
    }
    
    try {
      // Check for an existing session
      const { data, error } = await client.auth.getSession();
      
      if (error) {
        console.error("Authentication error:", error.message);
        throw new Error("Authentication failed: " + error.message);
      }
      
      // If no active session, try anonymous sign-in
      if (!data.session) {
        console.log("No active session, attempting anonymous sign-in");
        const { error: signInError } = await client.auth.signInAnonymously();
        
        if (signInError) {
          console.error("Anonymous sign-in failed:", signInError.message);
          throw new Error("Failed to sign in: " + signInError.message);
        }
      }
      
      return client;
    } catch (err) {
      console.error("Authentication check failed:", err);
      throw new Error("Authentication failed: " + err.message);
    }
  } 
  // Node.js environment - use service role key
  else if (typeof require !== 'undefined') {
    const { getSupabaseClient } = require('./db_utils');
    return getSupabaseClient();
  }
  
  throw new Error('Unable to initialize Supabase client - unknown environment');
}

/**
 * Parse file content based on file format
 * @param {string} content - The file content as string
 * @param {string} filename - The filename to determine format
 * @returns {Array} Array of parsed question objects
 */
function parseFileContent(content, filename) {
  let parsedQuestions = [];
  const format = filename.split('.').pop().toLowerCase();

  try {
    if (format === 'jsonl') {
      // Process JSONL format (one JSON object per line)
      const lines = content.split(/\r?\n/);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        try {
          const questionObj = JSON.parse(line);
          // Add line number for error reporting
          questionObj._lineNumber = i + 1;
          parsedQuestions.push(questionObj);
        } catch (lineError) {
          console.error(`Error parsing JSON at line ${i + 1}:`, lineError, `Line content: ${line}`);
          throw new Error(`Invalid JSON at line ${i + 1}: ${lineError.message}`);
        }
      }
    } else if (format === 'json') {
      // Process JSON format (array of question objects)
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed)) {
        parsedQuestions = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Handle single question object
        parsedQuestions = [parsed];
      } else {
        throw new Error("JSON content must be an array of question objects or a single question object");
      }
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
    
    return parsedQuestions;
  } catch (error) {
    console.error("Error parsing file content:", error);
    throw error;
  }
}

/**
 * Create a hash of a string (for question deduplication)
 * @param {string} text - The text to hash
 * @returns {string} SHA-256 hash in hex format
 */
async function createQuestionHash(text) {
  // Browser implementation
  if (typeof window !== 'undefined' && window.crypto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } 
  // Node.js implementation
  else if (typeof require !== 'undefined') {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
  }
  
  throw new Error('Crypto functionality not available');
}

/**
 * Normalize options format and validate
 * @param {Object|Array|string} options - The options in various formats
 * @param {string} lineInfo - Information about the question location for error reporting
 * @returns {Object|Array} Normalized options
 */
function normalizeOptions(options, lineInfo = 'unknown') {
  if (typeof options === 'string') {
    try {
      // Try to parse options if it's a JSON string
      return JSON.parse(options);
    } catch (e) {
      // If it's not valid JSON, leave it as a string
      console.warn(`Options for question at ${lineInfo} couldn't be parsed as JSON. Keeping as string.`);
      return options;
    }
  }
  
  // Check if options is an object with letter keys (A, B, C, D, etc.)
  if (!Array.isArray(options) && typeof options === 'object') {
    const keys = Object.keys(options);
    const hasLetterKeys = keys.some(key => /^[A-Z]$/.test(key));
    
    if (hasLetterKeys) {
      // Keep the object structure intact for options with letter keys
      return options;
    } else {
      // Only convert to array if not using letter keys
      return Object.values(options);
    }
  }
  
  return options;
}

/**
 * Process and validate answer_idx
 * @param {string|number} answerIdx - The answer index value
 * @param {Object|Array} options - The normalized options
 * @param {string} lineInfo - Information about the question location for error reporting
 * @returns {Object} Processed answer index with additional metadata
 */
function processAnswerIdx(answerIdx, options, lineInfo = 'unknown') {
  const result = { 
    answer_idx: answerIdx,
    _numeric_answer_idx: undefined
  };
  
  // Handle letter-based answer_idx (A, B, C, etc.)
  if (typeof answerIdx === 'string' && /^[A-Z]$/.test(answerIdx)) {
    // For letter-based answer_idx, ensure the options structure supports it
    if (typeof options === 'object' && !Array.isArray(options)) {
      // Check if the letter key exists in options
      if (options[answerIdx] === undefined) {
        throw new Error(`Question at ${lineInfo} has answer_idx "${answerIdx}" but this key doesn't exist in options`);
      }
    } else if (Array.isArray(options)) {
      // Convert letter to index if options is an array
      const letterIndex = answerIdx.charCodeAt(0) - 'A'.charCodeAt(0);
      if (letterIndex < 0 || letterIndex >= options.length) {
        throw new Error(`Question at ${lineInfo} has letter answer_idx "${answerIdx}" but options array has length ${options.length}`);
      }
      // Keep the letter answer_idx but add a numeric representation for validation
      result._numeric_answer_idx = letterIndex;
    }
  } else if (typeof answerIdx === 'string') {
    // Try to convert string number to actual number
    const numericIdx = parseInt(answerIdx, 10);
    if (!isNaN(numericIdx)) {
      result.answer_idx = numericIdx;
    } else {
      throw new Error(`Question at ${lineInfo} has invalid answer_idx: "${answerIdx}"`);
    }
  }
  
  // For numeric answer_idx, validate it's within bounds of array options
  if (typeof result.answer_idx === 'number') {
    if (Array.isArray(options)) {
      if (result.answer_idx < 0 || result.answer_idx >= options.length) {
        throw new Error(`Question at ${lineInfo} has answer_idx ${result.answer_idx} but options array has length ${options.length}`);
      }
    } else if (typeof options === 'object') {
      // If options is an object with letter keys but answer_idx is numeric, 
      // we should convert answer_idx to a letter key
      const keys = Object.keys(options);
      const letterKeys = keys.filter(key => /^[A-Z]$/.test(key)).sort();
      
      if (letterKeys.length > 0 && result.answer_idx < letterKeys.length) {
        // Store the numeric index but convert to letter for consistency
        result._numeric_answer_idx = result.answer_idx;
        result.answer_idx = letterKeys[result.answer_idx];
      } else {
        throw new Error(`Question at ${lineInfo} has numeric answer_idx ${result.answer_idx} but options is an object without enough letter keys`);
      }
    }
  }
  
  return result;
}

/**
 * Validate question fields
 * @param {Object} question - The question object
 * @param {string} lineInfo - Information about the question location for error reporting
 * @returns {Array} Array of missing required fields
 */
function validateRequiredFields(question, requiredFields = ['question', 'options', 'answer_idx', 'answer']) {
  return requiredFields.filter(field => question[field] === undefined);
}

// Export functions for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatFileSize,
    parseFileContent,
    createQuestionHash,
    normalizeOptions,
    processAnswerIdx,
    validateRequiredFields,
    getAuthenticatedSupabaseClient,
    ensureAuthenticatedClient
  };
} else if (typeof window !== 'undefined') {
  // Browser environment
  window.utils = {
    formatFileSize,
    parseFileContent,
    createQuestionHash,
    normalizeOptions,
    processAnswerIdx,
    validateRequiredFields,
    getAuthenticatedSupabaseClient,
    ensureAuthenticatedClient
  };
} 