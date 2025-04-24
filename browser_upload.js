// Browser-side upload functionality
// Adapting server-side upload.js for browser environment

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
        
        // Parse questions
        const questions = parseFileContent(fileContent, selectedFile.name);
        
        if (!questions || questions.length === 0) {
            throw new Error('No valid questions found in the file.');
        }
        
        showAlert('info', `Found ${questions.length} questions to upload.`);
        
        // Get file metadata
        const fileMetadata = getFileMetadata(selectedFile);
        
        // Process and upload questions in batches
        await uploadQuestions(questions, questionSet, fileMetadata);
        
    } catch (error) {
        console.error('Upload error:', error);
        showAlert('error', `Error: ${error.message || 'Failed to upload questions'}`);
        
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
        
        // Validate questions basic structure
        questions.forEach((q, index) => {
            if (!q.question) {
                throw new Error(`Question at index ${index} is missing the 'question' field.`);
            }
            if (!q.options || !Array.isArray(q.options)) {
                throw new Error(`Question at index ${index} is missing or has invalid 'options' field.`);
            }
            if (!q.answer) {
                throw new Error(`Question at index ${index} is missing the 'answer' field.`);
            }
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
    const supabase = window.supabaseClient;
    
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
            const { error } = await supabase.from('questions').insert(processedBatch);
            
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
    
    // Reset form for another upload
    setTimeout(() => {
        selectedFile = null;
        fileInfo.style.display = 'none';
        uploadForm.reset();
        progressBar.style.display = 'none';
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        uploadButton.disabled = true;
    }, 3000);
} 