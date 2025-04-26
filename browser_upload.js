// Browser-side upload functionality
// Adapting server-side upload.js for browser environment

// Verify Supabase client availability
document.addEventListener('DOMContentLoaded', () => {
    // Check if Supabase client is available
    if (!window.supabaseClient) {
        console.error("Supabase client is not initialized");
        showInitAlert("Database connection not available. Please refresh the page and try again.");
        return;
    }
    
    // Verify client has expected methods
    if (typeof window.supabaseClient.from !== 'function') {
        console.error("Supabase client is missing the 'from' method:", window.supabaseClient);
        showInitAlert("Invalid database client. Please refresh the page and try again.");
        return;
    }
    
    console.log("Supabase client verified successfully");
    
    // Ensure we have an authenticated client by calling our helper
    // This makes sure we have a valid session before uploading
    if (window.utils && window.utils.ensureAuthenticatedClient) {
        window.utils.ensureAuthenticatedClient()
            .then(() => {
                console.log("Authentication verified successfully");
            })
            .catch(error => {
                console.error("Authentication verification failed:", error);
                showInitAlert("Failed to verify authentication. Please refresh and try again.");
            });
    }
});

// Display initial alert for critical errors
function showInitAlert(message) {
    const alertContainer = document.getElementById('alert-container');
    if (alertContainer) {
        const alertElement = document.createElement('div');
        alertElement.className = 'alert alert-danger';
        alertElement.innerHTML = `<strong>Error:</strong> ${message}`;
        alertContainer.appendChild(alertElement);
    } else {
        alert(message);
    }
}

// DOM Elements
const uploadForm = document.getElementById('uploadForm');
const questionSetInput = document.getElementById('questionSet');
const fileDescriptionInput = document.getElementById('fileDescription');
const fileInput = document.getElementById('fileInput');
const browseButton = document.getElementById('browseButton');
const dropArea = document.getElementById('drop-area');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadButton = document.getElementById('uploadButton');
const progressBar = document.querySelector('.progress');
const uploadProgress = document.getElementById('uploadProgress');
const alertContainer = document.getElementById('alert-container');

// File object and content
let selectedFile = null;
let fileContent = null;
let fileContentHash = null;
let fileWarningContainer = null;

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Create warning container
    fileWarningContainer = document.createElement('div');
    fileWarningContainer.className = 'mt-3';
    fileWarningContainer.style.display = 'none';
    fileWarningContainer.style.color = '#dc3545'; // Bootstrap danger red
    // Insert after fileInfo
    fileInfo.after(fileWarningContainer);
    
    // File selection via button
    browseButton.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File selection handler
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop handlers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    dropArea.addEventListener('drop', handleDrop, false);
    
    // Form submission
    uploadForm.addEventListener('submit', handleUpload);
});

// Utility functions
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    dropArea.classList.add('highlight');
}

function unhighlight() {
    dropArea.classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        handleFileSelection(files[0]);
    }
}

function handleFileSelect(e) {
    if (fileInput.files.length > 0) {
        handleFileSelection(fileInput.files[0]);
    }
}

async function handleFileSelection(file) {
    // Validate file type
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'json' && fileExt !== 'jsonl') {
        showAlert('error', 'Invalid file type. Please select a JSON or JSONL file.');
        return;
    }
    
    // Store file and update UI
    selectedFile = file;
    fileInfo.style.display = 'block';
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    uploadButton.disabled = false;
    
    // Clear previous warning
    fileWarningContainer.style.display = 'none';
    fileWarningContainer.innerHTML = '';
    
    try {
        // Read file content and calculate hash
        fileContent = await readFileContent(file);
        fileContentHash = await createFileContentHash(fileContent);
        
        // Check if this file has been uploaded before
        await checkForPreviousUpload(fileContentHash);
        
        showAlert('info', 'File selected. Enter a question set name and click "Upload Questions" to begin.');
    } catch (error) {
        console.error('Error processing file:', error);
        showAlert('error', `Error processing file: ${error.message}`);
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

function showAlert(type, message) {
    // Clear previous alerts
    alertContainer.innerHTML = '';
    
    // Create new alert
    const alert = document.createElement('div');
    alert.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    }, 10000);
}

function getFileMetadata(file) {
    // Get current browser and platform info
    const browserInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        devicePixelRatio: window.devicePixelRatio || 1
    };
    
    // Get user information
    const userElement = document.getElementById('welcomeUser');
    const userInfo = {};
    
    if (userElement) {
        // Extract email if present
        const emailMatch = userElement.innerText.match(/Email: ([^\s|]+)/);
        if (emailMatch && emailMatch[1]) {
            userInfo.email = emailMatch[1];
        }
        
        // Extract name if present
        const nameMatch = userElement.innerText.match(/Name: ([^|]+)(?:\||$)/);
        if (nameMatch && nameMatch[1]) {
            userInfo.name = nameMatch[1].trim();
        }
        
        // Extract ID if present
        const idMatch = userElement.innerText.match(/ID: ([a-f0-9-]+)/i);
        if (idMatch && idMatch[1]) {
            userInfo.id = idMatch[1];
        }
    }
    
    // Create comprehensive metadata object
    return {
        // File information
        filename: file.name,
        filesize: file.size,
        filetype: file.type,
        last_modified: new Date(file.lastModified).toISOString(),
        
        // Upload context
        upload_time: new Date().toISOString(),
        upload_method: 'browser',
        uploader_id: localStorage.getItem('userId') || 'anonymous',
        
        // User information
        user_info: userInfo,
        
        // Browser/platform information
        browser_info: browserInfo,
        
        // Source tracking
        source: 'web_upload',
        version: '1.0',
        origin_url: window.location.href
    };
}

async function handleUpload(e) {
    e.preventDefault();
    
    // Validate inputs
    if (!selectedFile) {
        showAlert('error', 'Please select a file to upload.');
        return;
    }
    
    const questionSet = questionSetInput.value.trim();
    if (!questionSet) {
        showAlert('error', 'Please enter a question set name.');
        questionSetInput.focus();
        return;
    }
    
    try {
        // Show progress
        progressBar.style.display = 'flex';
        uploadButton.disabled = true;
        
        // Read file content
        fileContent = await readFileContent(selectedFile);
        
        // Create hash of file content for logging
        fileContentHash = await createFileContentHash(fileContent);
        
        // Show initial alert
        showAlert('info', 'Parsing file content...');
        
        // Parse questions
        let questions;
        try {
            questions = parseFileContent(fileContent, selectedFile.name);
        } catch (parseError) {
            // Add more detailed error for parsing failures
            console.error('Parse error:', parseError);
            
            // Try to show a sample of the file content to help with debugging
            let contentSample = fileContent.substring(0, 500);
            contentSample = contentSample.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            throw new Error(`
                Failed to parse file: ${parseError.message}<br>
                <br>
                <strong>Sample of file content:</strong><br>
                <pre class="bg-light p-2" style="font-size: 0.8rem; max-height: 150px; overflow: auto;">${contentSample}...</pre>
                <br>
                <strong>Expected format:</strong><br>
                <code>{"question": "...", "options": ["A", "B", "C", "D"], "answer": "A"}</code>
            `);
        }
        
        if (!questions || questions.length === 0) {
            throw new Error('No valid questions found in the file.');
        }
        
        // Log file to file_log table before processing questions
        await logFileUpload(questionSet);
        
        showAlert('info', `Found ${questions.length} questions to upload.`);
        
        // Add a debug button only in development environments
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const debugBtn = document.createElement('button');
            debugBtn.className = 'btn btn-sm btn-secondary ms-2';
            debugBtn.textContent = 'View Data (Debug)';
            debugBtn.addEventListener('click', () => {
                console.log('Parsed questions:', questions);
                showAlert('info', 'Question data logged to console. Press F12 to view.');
            });
            alertContainer.querySelector('.alert:last-child')?.appendChild(debugBtn);
        }
        
        // Get file metadata
        const fileMetadata = getFileMetadata(selectedFile);
        
        // Process and upload questions in batches
        await uploadQuestions(questions, questionSet, fileMetadata);
        
    } catch (error) {
        console.error('Upload error:', error);
        
        // If error message contains HTML, render it properly
        if (error.message.includes('<')) {
            const errorDiv = document.createElement('div');
            errorDiv.innerHTML = `Error: ${error.message}`;
            
            // Clear previous alerts
            alertContainer.innerHTML = '';
            
            // Create new alert container
            const alert = document.createElement('div');
            alert.className = 'alert alert-danger alert-dismissible fade show';
            alert.role = 'alert';
            
            // Add the error content
            alert.appendChild(errorDiv);
            
            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'btn-close';
            closeBtn.setAttribute('data-bs-dismiss', 'alert');
            closeBtn.setAttribute('aria-label', 'Close');
            alert.appendChild(closeBtn);
            
            alertContainer.appendChild(alert);
        } else {
            showAlert('error', `Error: ${error.message || 'Failed to upload questions'}`);
        }
        
        // Reset progress
        progressBar.style.display = 'none';
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        uploadButton.disabled = false;
    }
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = (error) => {
            reject(new Error('Failed to read file: ' + error));
        };
        
        reader.readAsText(file);
    });
}

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
        
        // Normalize and validate the parsed questions
        const normalizedQuestions = [];
        const requiredFields = ['question', 'options', 'answer_idx', 'answer'];
        
        for (let i = 0; i < parsedQuestions.length; i++) {
            const q = parsedQuestions[i];
            const lineInfo = q._lineNumber ? `line ${q._lineNumber}` : `index ${i}`;
            
            // Validate required fields
            const missingFields = requiredFields.filter(field => q[field] === undefined);
            if (missingFields.length > 0) {
                throw new Error(`Question at ${lineInfo} is missing required fields: ${missingFields.join(', ')}`);
            }
            
            // Create a normalized copy of the question object
            const normalizedQ = { ...q };
            
            // Ensure options is properly handled based on its format
            if (typeof normalizedQ.options === 'string') {
                try {
                    // Try to parse options if it's a JSON string
                    normalizedQ.options = JSON.parse(normalizedQ.options);
                } catch (e) {
                    // If it's not valid JSON, leave it as a string
                    console.warn(`Options for question at ${lineInfo} couldn't be parsed as JSON. Keeping as string.`);
                }
            }
            
            
            
            // Validate and normalize answer_idx
            if (normalizedQ.answer_idx !== undefined) {
                // Handle letter-based answer_idx (A, B, C, etc.)
                if (typeof normalizedQ.answer_idx === 'string' && /^[A-Z]$/.test(normalizedQ.answer_idx)) {
                    // For letter-based answer_idx, ensure the options structure supports it
                    if (typeof normalizedQ.options === 'object' && 
                        !Array.isArray(normalizedQ.options)) {
                        // Check if the letter key exists in options
                        if (normalizedQ.options[normalizedQ.answer_idx] === undefined) {
                            throw new Error(`Question at ${lineInfo} has answer_idx "${normalizedQ.answer_idx}" but this key doesn't exist in options`);
                        }
                    } else if (Array.isArray(normalizedQ.options)) {
                        // Convert letter to index if options is an array
                        const letterIndex = normalizedQ.answer_idx.charCodeAt(0) - 'A'.charCodeAt(0);
                        if (letterIndex < 0 || letterIndex >= normalizedQ.options.length) {
                            throw new Error(`Question at ${lineInfo} has letter answer_idx "${normalizedQ.answer_idx}" but options array has length ${normalizedQ.options.length}`);
                        }
                        // Keep the letter answer_idx but add a numeric representation for validation
                        normalizedQ._numeric_answer_idx = letterIndex;
                    }
                } else if (typeof normalizedQ.answer_idx === 'string') {
                    // Try to convert string number to actual number
                    const numericIdx = parseInt(normalizedQ.answer_idx, 10);
                    if (!isNaN(numericIdx)) {
                        normalizedQ.answer_idx = numericIdx;
                    } else {
                        throw new Error(`Question at ${lineInfo} has invalid answer_idx: "${normalizedQ.answer_idx}"`);
                    }
                }
                
                // For numeric answer_idx, validate it's within bounds of array options
                if (typeof normalizedQ.answer_idx === 'number') {
                    if (Array.isArray(normalizedQ.options)) {
                        if (normalizedQ.answer_idx < 0 || normalizedQ.answer_idx >= normalizedQ.options.length) {
                            throw new Error(`Question at ${lineInfo} has answer_idx ${normalizedQ.answer_idx} but options array has length ${normalizedQ.options.length}`);
                        }
                    } else if (typeof normalizedQ.options === 'object') {
                        // If options is an object with letter keys but answer_idx is numeric, 
                        // we should convert answer_idx to a letter key
                        const keys = Object.keys(normalizedQ.options);
                        const letterKeys = keys.filter(key => /^[A-Z]$/.test(key)).sort();
                        
                        if (letterKeys.length > 0 && normalizedQ.answer_idx < letterKeys.length) {
                            // Store the numeric index but convert to letter for consistency
                            normalizedQ._numeric_answer_idx = normalizedQ.answer_idx;
                            normalizedQ.answer_idx = letterKeys[normalizedQ.answer_idx];
                            console.warn(`Question at ${lineInfo}: Converting numeric answer_idx ${normalizedQ._numeric_answer_idx} to letter key "${normalizedQ.answer_idx}"`);
                        } else {
                            throw new Error(`Question at ${lineInfo} has numeric answer_idx ${normalizedQ.answer_idx} but options is an object without enough letter keys`);
                        }
                    }
                }
            }
            
            // Validate answer against answer_idx
            if (normalizedQ.answer && normalizedQ.answer_idx !== undefined) {
                let derivedAnswer;
                
                // Get the expected answer based on answer_idx
                if (typeof normalizedQ.answer_idx === 'string' && /^[A-Z]$/.test(normalizedQ.answer_idx) && 
                    typeof normalizedQ.options === 'object' && !Array.isArray(normalizedQ.options)) {
                    // Letter index with object options
                    derivedAnswer = normalizedQ.options[normalizedQ.answer_idx];
                } else if (typeof normalizedQ.answer_idx === 'number' && Array.isArray(normalizedQ.options)) {
                    // Numeric index with array options
                    derivedAnswer = normalizedQ.options[normalizedQ.answer_idx];
                } else if (normalizedQ._numeric_answer_idx !== undefined && Array.isArray(normalizedQ.options)) {
                    // Using stored numeric index
                    derivedAnswer = normalizedQ.options[normalizedQ._numeric_answer_idx];
                }
                
                // Check if answer matches the option at answer_idx
                if (derivedAnswer !== undefined && normalizedQ.answer !== derivedAnswer) {
                    console.warn(`Question at ${lineInfo}: answer "${normalizedQ.answer}" doesn't match the option at answer_idx: "${derivedAnswer}"`);
                }
            }
            
            // Add the normalized question to the result array
            normalizedQuestions.push(normalizedQ);
        }
        
        return normalizedQuestions;
    } catch (error) {
        console.error("Error parsing file content:", error);
        throw error;
    }
}

async function uploadQuestions(questions, questionSet, fileMetadata) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return {
            success: false,
            message: "No valid questions provided for upload."
        };
    }

    // Get authenticated Supabase client using our utility function
    let supabaseClient;
    try {
        if (window.utils && window.utils.ensureAuthenticatedClient) {
            supabaseClient = await window.utils.ensureAuthenticatedClient();
        } else {
            // Fallback if utils is not available
            if (!window.supabaseClient) {
                throw new Error("Database connection not available.");
            }
            supabaseClient = window.supabaseClient;
        }
    } catch (error) {
        console.error("Authentication error:", error);
        return {
            success: false,
            message: "Authentication failed: " + error.message
        };
    }

    const results = {
        success: true,
        total: questions.length,
        processed: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        duplicates: []
    };

    // Group questions into batches to avoid sending too many at once
    const batchSize = 25;
    const batches = [];
    
    for (let i = 0; i < questions.length; i += batchSize) {
        batches.push(questions.slice(i, i + batchSize));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const processedBatch = [];
        
        // Process each question in the batch
        for (const q of batch) {
            try {
                // Validate required fields
                const requiredFields = ['question', 'options', 'answer_idx', 'answer'];
                const missingFields = requiredFields.filter(field => q[field] === undefined);
                
                if (missingFields.length > 0) {
                    results.failed++;
                    results.errors.push(`Question missing required fields: ${missingFields.join(', ')}`);
                    continue;
                }
                
                // Create a hash of the question to check for duplicates
                const questionData = q.question
                let questionHash;
                
                // First check if the source data already has a question_hash
                if (q.question_hash) {
                    // Use the existing hash from the source data
                    questionHash = q.question_hash;
                } else if (q.other && q.other.question_hash) {
                    // Try to get hash from the other field if it exists
                    questionHash = q.other.question_hash;
                } else if (q.other && q.other.hash_full_question) {
                    // Try to get hash_full_question from the other field if it exists
                    questionHash = q.other.hash_full_question;
                } else {
                    // Generate a new hash if no existing hash found
                    questionHash = await createQuestionHash(questionData);
                }
                
                // Look for source question UUID in various possible locations
                let srcQuestionUid = null;
                if (q.stdQuestionUUID) {
                    srcQuestionUid = q.stdQuestionUUID;
                } else if (q.other && q.other.stdQuestionUUID) {
                    srcQuestionUid = q.other.stdQuestionUUID;
                } else if (q.src_question_uid) {
                    srcQuestionUid = q.src_question_uid;
                } else if (q.other && q.other.src_question_uid) {
                    srcQuestionUid = q.other.src_question_uid;
                }
                // No fallback for srcQuestionUid - it will remain null if not found
                
                // Look for source question hash in various possible locations - DON'T generate if not found
                let srcQuestionHash = null;
                if (q.src_question_hash) {
                    srcQuestionHash = q.src_question_hash;
                } else if (q.other && q.other.src_question_hash) {
                    srcQuestionHash = q.other.src_question_hash;
                } else if (q.hash_full_question) {
                    srcQuestionHash = q.hash_full_question;
                } else if (q.other && q.other.hash_full_question) {
                    srcQuestionHash = q.other.hash_full_question;
                }
                // No fallback - we don't generate a new src_question_hash if not found
                
                // Define known fields that we explicitly map to database columns
                const knownMappedFields = [
                    'question',
                    'options',
                    'answer',
                    'answer_idx',
                    'meta_info',
                    'question_hash',
                    "src_question_hash",
                    "src_question_uid",
                    'other'  // 'other' is directly mapped to the database column
                ];
                
                // Identify unmapped fields for overflow
                const overflowFields = {};
                
                // Add all fields not directly mapped to database columns to overflow
                Object.keys(q).forEach(key => {
                    // Skip fields that will be explicitly mapped to database columns
                    // and internal fields used for processing
                    if (!knownMappedFields.includes(key) && 
                        key !== '_lineNumber' && 
                        key !== '_numeric_answer_idx' &&
                        key !== 'question_set') {  // question_set is added separately
                        
                        // Add the field to overflow, including explanation, category, etc.
                        overflowFields[key] = q[key];
                    }
                });
                
                // Prepare the question data for upload
                const questionObj = {
                    question_set: questionSet,
                    question: q.question,
                    options: typeof q.options === 'object' ? q.options : JSON.parse(q.options),
                    answer: q.answer,
                    answer_idx: q.answer_idx,
                    question_hash: questionHash,
                    meta_info: q.meta_info || null,
                    answer_count: 0,
                    extraJ: fileMetadata, // Pass object directly, not stringified
                    src_file_content_hash: fileContentHash,  // Add file content hash
                    src_question_uid: srcQuestionUid,
                    src_question_hash: srcQuestionHash
                };
                
                // Add 'other' column if present in the source file
                if (q.other !== undefined) {
                    questionObj.other = typeof q.other === 'object' 
                        ? q.other 
                        : JSON.parse(q.other);
                }
                
                // Add 'overflow' column if there are unmapped fields
                if (Object.keys(overflowFields).length > 0) {
                    questionObj.overflow = overflowFields; // Pass object directly
                }
                
                processedBatch.push(questionObj);
            } catch (error) {
                results.failed++;
                results.errors.push(`Failed to process question: ${error.message}`);
            }
        }
        
        if (processedBatch.length === 0) {
            continue; // Skip empty batches
        }
        
        try {
            // Use Supabase client to insert questions directly
            const { data, error } = await supabaseClient
                .from('questions')
                .insert(processedBatch);
                
            if (error) {
                throw error;
            }
            
            // Update results
            results.processed += processedBatch.length;
            
            // Update UI progress
            const progressPercent = Math.round((results.processed + results.failed) / results.total * 100);
            uploadProgress.style.width = `${progressPercent}%`;
            uploadProgress.textContent = `${progressPercent}%`;
            
        } catch (error) {
            console.error("Database error:", error);
            
            // Check if error is for duplicate questions
            if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
                // Extract the duplicate questions and mark them as skipped
                for (const q of processedBatch) {
                    results.skipped++;
                    results.duplicates.push(q.question.substring(0, 50) + '...');
                }
            } else {
                results.failed += processedBatch.length;
                results.errors.push(`Batch ${batchIndex + 1} failed: ${error.message}`);
            }
        }
    }
    
    // Determine overall success based on processed vs failed
    results.success = results.processed > 0 && results.failed < questions.length;
    results.message = results.success 
        ? `Successfully processed ${results.processed} questions (${results.skipped} duplicates skipped, ${results.failed} failed).`
        : `Failed to upload questions: ${results.errors.length} errors occurred.`;
    
    // If successful, call the uploadComplete function
    if (results.success) {
        uploadComplete(results.processed);
    } else {
        // Show error alert
        showAlert('error', results.message);
        
        // Reset progress
        progressBar.style.display = 'none';
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        uploadButton.disabled = false;
    }
    
    return results;
}

// Helper function to create a hash of a question for duplicate detection
async function createQuestionHash(questionText) {
    const encoder = new TextEncoder();
    const data = encoder.encode(questionText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function uploadComplete(total) {
    // Show success message
    showAlert('success', `Successfully uploaded ${total} questions! You can now use them in the practice app.`);
    
    // Store the question set name to preserve it
    const questionSetValue = questionSetInput.value;
    
    // Reset form for another upload but preserve question set name
    setTimeout(() => {
        selectedFile = null;
        fileInfo.style.display = 'none';
        fileInput.value = ''; // Clear file input but don't reset entire form
        progressBar.style.display = 'none';
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        uploadButton.disabled = true;
        
        // Preserve the question set name
        questionSetInput.value = questionSetValue;
    }, 3000);
}

/**
 * Create a hash of the file content
 * @param {string} content - The file content to hash
 * @returns {Promise<string>} SHA-256 hash in hex format
 */
async function createFileContentHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Log file upload to file_log table
 * @param {string} questionSet - The question set name
 * @returns {Promise<void>}
 */
async function logFileUpload(questionSet) {
    // Get the description from the textarea
    const description = fileDescriptionInput.value.trim();
    
    // Get authenticated Supabase client
    let supabaseClient;
    try {
        if (window.utils && window.utils.ensureAuthenticatedClient) {
            supabaseClient = await window.utils.ensureAuthenticatedClient();
        } else {
            if (!window.supabaseClient) {
                throw new Error("Database connection not available.");
            }
            supabaseClient = window.supabaseClient;
        }
    } catch (error) {
        console.error("Authentication error:", error);
        throw new Error("Authentication failed: " + error.message);
    }
    
    // Prepare the file log entry
    const fileLogEntry = {
        question_set: questionSet,
        description: description || null,
        filename: selectedFile.name,
        content_hash: fileContentHash,
        ftype: selectedFile.name.split('.').pop().toLowerCase()
    };
    
    try {
        // Insert log entry
        const { data, error } = await supabaseClient
            .from('file_log')
            .insert(fileLogEntry);
            
        if (error) {
            console.error("Error logging file:", error);
            throw new Error("Failed to log file: " + error.message);
        }
        
        console.log("File logged successfully:", data);
        return data;
    } catch (error) {
        console.error("Error logging file:", error);
        throw new Error("Failed to log file: " + error.message);
    }
}

/**
 * Check if a file with the same content hash has been uploaded before
 * @param {string} contentHash - The content hash to check
 */
async function checkForPreviousUpload(contentHash) {
    if (!contentHash) return;
    
    try {
        // Get authenticated Supabase client
        let supabaseClient;
        if (window.utils && window.utils.getAuthenticatedSupabaseClient) {
            supabaseClient = window.utils.getAuthenticatedSupabaseClient();
        } else {
            if (!window.supabaseClient) {
                throw new Error("Database connection not available.");
            }
            supabaseClient = window.supabaseClient;
        }
        
        // Query the file_log table for the content hash
        const { data, error } = await supabaseClient
            .from('file_log')
            .select('question_set, filename, description, created_at')
            .eq('content_hash', contentHash)
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error("Error checking for previous upload:", error);
            return;
        }
        
        // If we found a match, show a warning
        if (data && data.length > 0) {
            const previousUpload = data[0];
            const formattedDate = new Date(previousUpload.created_at).toLocaleString();
            
            // Create warning message
            let warningMessage = `
                <strong>⚠️ Warning:</strong> A file with the same content (hash: ${contentHash}) 
                has been uploaded before on ${formattedDate}.
                <br><br>
                <strong>Previous upload details:</strong><br>
                <ul>
                    <li><strong>Question Set:</strong> ${escapeHtml(previousUpload.question_set)}</li>
                    <li><strong>Filename:</strong> ${escapeHtml(previousUpload.filename || 'Not specified')}</li>
            `;
            
            if (previousUpload.description) {
                warningMessage += `<li><strong>Description:</strong> ${escapeHtml(previousUpload.description)}</li>`;
            }
            
            warningMessage += `</ul>`;
            
            // Show the warning
            fileWarningContainer.innerHTML = warningMessage;
            fileWarningContainer.style.display = 'block';
        }
    } catch (error) {
        console.error("Error checking for previous upload:", error);
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} unsafe 
 * @returns {string} Escaped HTML
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
} 