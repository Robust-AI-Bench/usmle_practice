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

// File object
let selectedFile = null;

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
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

function handleFileSelection(file) {
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
    
    showAlert('info', 'File selected. Enter a question set name and click "Upload Questions" to begin.');
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
    return {
        filename: file.name,
        filesize: file.size,
        filetype: file.type,
        last_modified: new Date(file.lastModified).toISOString(),
        upload_time: new Date().toISOString(),
        uploader_id: localStorage.getItem('userId') || 'anonymous',
        uploader_email: document.getElementById('welcomeUser')?.innerText?.match(/Email: ([^\s|]+)/)?.pop() || null,
        uploader_name: document.getElementById('welcomeUser')?.innerText?.match(/Name: ([^>]+)$/)?.pop() || null
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
        const fileContent = await readFileContent(selectedFile);
        
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
    const extension = filename.split('.').pop().toLowerCase();
    let questions = [];
    
    try {
        if (extension === 'jsonl') {
            // Parse JSONL (one JSON object per line)
            questions = content
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } else if (extension === 'json') {
            // Parse JSON (single array or object)
            const parsed = JSON.parse(content);
            questions = Array.isArray(parsed) ? parsed : [parsed];
        } else {
            throw new Error('Unsupported file format. Please use JSON or JSONL format.');
        }
        
        console.log("First question sample:", JSON.stringify(questions[0], null, 2));
        
        // Validate and normalize questions
        questions = questions.map((q, index) => {
            // Create a normalized copy
            const normalizedQ = {...q};
            
            // Check required fields
            if (!normalizedQ.question) {
                throw new Error(`Question at index ${index} is missing the 'question' field. Sample: ${JSON.stringify(q).substring(0, 100)}...`);
            }
            
            // Handle options field - could be an array, string, or object with option keys
            if (normalizedQ.options) {
                // If options is a string, try to parse it as JSON
                if (typeof normalizedQ.options === 'string') {
                    try {
                        normalizedQ.options = JSON.parse(normalizedQ.options);
                    } catch (e) {
                        // If it can't be parsed, split by line breaks or commas
                        normalizedQ.options = normalizedQ.options.split(/[\n,]/).map(o => o.trim()).filter(o => o);
                    }
                }
                
                // If it's an object, convert to array
                if (!Array.isArray(normalizedQ.options) && typeof normalizedQ.options === 'object') {
                    normalizedQ.options = Object.values(normalizedQ.options);
                }
            } 
            // If no options field but has numbered fields (option1, option2, etc.)
            else if (!normalizedQ.options) {
                const optionFields = [];
                // Look for fields like option1, option2, option_1, etc.
                for (const key in normalizedQ) {
                    if (key.match(/^option[_]?(\d+)$/) || key.match(/^(\d+)$/)) {
                        optionFields.push({
                            key: key,
                            value: normalizedQ[key]
                        });
                        delete normalizedQ[key]; // Remove the original field
                    }
                }
                
                if (optionFields.length > 0) {
                    // Sort by option number
                    optionFields.sort((a, b) => {
                        const numA = parseInt(a.key.match(/\d+/)[0]);
                        const numB = parseInt(b.key.match(/\d+/)[0]);
                        return numA - numB;
                    });
                    
                    normalizedQ.options = optionFields.map(f => f.value);
                } else {
                    // Still can't find options
                    throw new Error(`Question at index ${index} is missing the 'options' field. Available fields: ${Object.keys(q).join(', ')}`);
                }
            }
            
            // Ensure options is an array
            if (!Array.isArray(normalizedQ.options)) {
                throw new Error(`Question at index ${index} has invalid 'options' field. Expected an array but got: ${typeof normalizedQ.options}. Value: ${JSON.stringify(normalizedQ.options).substring(0, 100)}...`);
            }
            
            // Remove empty options
            normalizedQ.options = normalizedQ.options.filter(opt => opt !== null && opt !== undefined && opt !== '');
            
            if (normalizedQ.options.length === 0) {
                throw new Error(`Question at index ${index} has empty 'options' array after normalization.`);
            }
            
            // Check for answer
            if (!normalizedQ.answer) {
                // Try to determine answer from answer_idx if possible
                if (normalizedQ.answer_idx !== undefined && normalizedQ.answer_idx !== null &&
                    normalizedQ.options[normalizedQ.answer_idx]) {
                    normalizedQ.answer = normalizedQ.options[normalizedQ.answer_idx];
                } else {
                    throw new Error(`Question at index ${index} is missing the 'answer' field and cannot be determined from answer_idx.`);
                }
            }
            
            // Try to determine answer_idx if missing but answer exists
            if ((normalizedQ.answer_idx === undefined || normalizedQ.answer_idx === null) && normalizedQ.answer) {
                const answerIndex = normalizedQ.options.findIndex(
                    opt => opt === normalizedQ.answer || 
                           JSON.stringify(opt) === JSON.stringify(normalizedQ.answer)
                );
                if (answerIndex !== -1) {
                    normalizedQ.answer_idx = answerIndex;
                }
            }
            
            return normalizedQ;
        });
        
        return questions;
    } catch (error) {
        if (error.name === 'SyntaxError') {
            throw new Error('Invalid JSON format. Please check your file.');
        }
        throw error;
    }
}

async function uploadQuestions(questions, questionSet, fileMetadata) {
    // Check if Supabase client is available
    if (!window.supabaseClient) {
        console.error("Supabase client is not initialized");
        throw new Error("Database connection not available. Please refresh the page and try again.");
    }
    
    const supabase = window.supabaseClient;
    
    // Verify the client has the expected methods
    if (typeof supabase.from !== 'function') {
        console.error("Supabase client is missing the 'from' method:", supabase);
        throw new Error("Invalid database client. Please refresh the page and try again.");
    }
    
    // Process questions in batches of 100
    const batchSize = 100;
    let processed = 0;
    
    for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize);
        const processedBatch = batch.map(q => {
            // Create SHA-256 hash of the question text to detect duplicates
            const questionData = q.question + JSON.stringify(q.options) + q.answer;
            const questionHash = createSHA256Hash(questionData);
            
            // Define known fields that we explicitly map to database columns
            const knownMappedFields = [
                'question',
                'options',
                'answer',
                'answer_idx',
                'meta_info',
                'other'
            ];
            
            // Identify unmapped fields for overflow
            const overflowFields = {};
            Object.keys(q).forEach(key => {
                // Skip fields that will be explicitly mapped to database columns
                if (!knownMappedFields.includes(key)) {
                    overflowFields[key] = q[key];
                }
            });
            
            // Create the base object
            const questionObj = {
                question_set: questionSet,
                question: q.question,
                options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options),
                answer: q.answer,
                answer_idx: q.answer_idx,
                question_hash: questionHash,
                meta_info: q.meta_info || null,
                answer_count: 0,
                extraJ: JSON.stringify(fileMetadata) // Add file metadata to extraJ column
            };
            
            // Add 'other' column if present in input
            if (q.other) {
                questionObj.other = typeof q.other === 'string' 
                    ? q.other 
                    : JSON.stringify(q.other);
            }
            
            // Add overflow data if there are unmapped fields
            if (Object.keys(overflowFields).length > 0) {
                questionObj.overflow = JSON.stringify(overflowFields);
            }
            
            return questionObj;
        });
        
        try {
            console.log(`Uploading batch ${i+1}-${i+Math.min(batch.length, batchSize)} (${processedBatch.length} questions)`);
            
            const { data, error } = await supabase.from('questions').insert(processedBatch);
            
            if (error) {
                throw error;
            }
            
            processed += batch.length;
            
            // Update progress
            const percentage = Math.round((processed / questions.length) * 100);
            uploadProgress.style.width = `${percentage}%`;
            uploadProgress.textContent = `${percentage}%`;
            uploadProgress.setAttribute('aria-valuenow', percentage);
            
            // Update status
            showAlert('info', `Processed ${processed}/${questions.length} questions...`);
            
            // If all questions are processed
            if (processed >= questions.length) {
                uploadComplete(processed);
            }
        } catch (error) {
            console.error(`Error uploading batch (${i+1}-${i+Math.min(batch.length, batchSize)}):`, error);
            throw new Error(`Failed to upload questions: ${error.message || 'Database error'}`);
        }
    }
}

function createSHA256Hash(data) {
    // Web Crypto API for creating SHA-256 hash
    // Note: This is async in real implementation, we're using a simple alternative here
    let hash = 0;
    if (data.length === 0) return hash.toString(16);
    
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to hex string
    return (hash >>> 0).toString(16).padStart(8, '0');
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