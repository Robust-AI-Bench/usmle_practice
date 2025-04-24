// Data and Options functionality for displaying storage data and question statistics

// DOM elements
const urlParamsViewer = document.getElementById('urlParamsViewer');
const localStorageViewer = document.getElementById('localStorageViewer');
const clearLocalStorageBtn = document.getElementById('clearLocalStorageBtn');
const refreshLocalStorageBtn = document.getElementById('refreshLocalStorageBtn');
const statsLoadingSpinner = document.getElementById('statsLoadingSpinner');
const statsTableContainer = document.getElementById('statsTableContainer');
const statsTableBody = document.getElementById('statsTableBody');
const statsErrorContainer = document.getElementById('statsErrorContainer');
const fileHashLoadingSpinner = document.getElementById('fileHashLoadingSpinner');
const fileHashTableContainer = document.getElementById('fileHashTableContainer');
const fileHashTableBody = document.getElementById('fileHashTableBody');
const fileHashErrorContainer = document.getElementById('fileHashErrorContainer');

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Make sure Supabase is initialized
    if (!window.supabaseClient) {
        console.error("Supabase client is not initialized");
        showError("Database connection not available. Please refresh the page and try again.");
        return;
    }
    
    // Display URL parameters
    displayUrlParameters();
    
    // Display localStorage data
    displayLocalStorage();
    
    // Fetch question set statistics
    fetchQuestionStats();
    
    // Fetch file hash statistics
    fetchFileHashStats();
    
    // Add event listeners for buttons
    clearLocalStorageBtn.addEventListener('click', clearLocalStorage);
    refreshLocalStorageBtn.addEventListener('click', refreshLocalStorage);
});

// Display URL parameters
function displayUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramsObject = {};
    
    for (const [key, value] of urlParams.entries()) {
        paramsObject[key] = value;
    }
    
    // Also include hash parameters if any
    if (window.location.hash) {
        paramsObject['#hash'] = window.location.hash.substring(1);
    }
    
    // Display parameters or show empty message
    if (Object.keys(paramsObject).length === 0) {
        urlParamsViewer.textContent = 'No URL parameters found.';
    } else {
        urlParamsViewer.textContent = JSON.stringify(paramsObject, null, 2);
    }
}

// Display localStorage data
function displayLocalStorage() {
    const storageObject = {};
    
    try {
        // Get all items from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            let value = localStorage.getItem(key);
            
            // Try to parse JSON values
            try {
                value = JSON.parse(value);
            } catch (e) {
                // Keep as string if not valid JSON
            }
            
            storageObject[key] = value;
        }
        
        // Display data or show empty message
        if (Object.keys(storageObject).length === 0) {
            localStorageViewer.textContent = 'No localStorage data found.';
        } else {
            localStorageViewer.textContent = JSON.stringify(storageObject, null, 2);
        }
    } catch (error) {
        console.error('Error accessing localStorage:', error);
        localStorageViewer.textContent = 'Error accessing localStorage: ' + error.message;
    }
}

// Clear localStorage data
function clearLocalStorage() {
    if (confirm('Are you sure you want to clear all localStorage data? This will remove all saved settings and preferences.')) {
        try {
            localStorage.clear();
            refreshLocalStorage();
            
            // Show success message
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-success mt-3';
            alertDiv.textContent = 'LocalStorage cleared successfully.';
            localStorageViewer.parentNode.insertBefore(alertDiv, localStorageViewer.nextSibling);
            
            // Remove the alert after a few seconds
            setTimeout(() => {
                alertDiv.remove();
            }, 3000);
        } catch (error) {
            console.error('Error clearing localStorage:', error);
            alert('Error clearing localStorage: ' + error.message);
        }
    }
}

// Refresh localStorage display
function refreshLocalStorage() {
    displayLocalStorage();
}

// Fetch question set statistics from Supabase
async function fetchQuestionStats() {
    try {
        // Show loading spinner
        statsLoadingSpinner.style.display = 'block';
        statsTableContainer.style.display = 'none';
        statsErrorContainer.style.display = 'none';
        
        // Get current user ID from localStorage or use 'anonymous' if not available
        const currentUserId = localStorage.getItem('userId') || 'anonymous';
        
        // Query Supabase for question set counts using the correct syntax
        // Include user_id in the query
        const { data, error } = await window.supabaseClient
            .from('questions')
            .select(`
                question_set,
                count(),
                total_answers:answer_count.sum()
            `);
        
        if (error) {
            console.error('Error fetching question stats:', error);
            throw new Error(error.message);
        }
        
        // Hide spinner and show table
        statsLoadingSpinner.style.display = 'none';
        statsTableContainer.style.display = 'block';
        
        // Clear existing table data
        statsTableBody.innerHTML = '';
        
        if (!data || data.length === 0) {
            // No data found
            const noDataRow = document.createElement('tr');
            noDataRow.innerHTML = `
                <td colspan="4" class="text-center">No question sets found in the database.</td>
            `;
            statsTableBody.appendChild(noDataRow);
        } else {
            // Sort data by question set name
            data.sort((a, b) => a.question_set.localeCompare(b.question_set));
            
            // Add each question set to the table
            data.forEach(set => {
                const row = document.createElement('tr');
                
                // Format total answers, handle nulls
                const totalAnswers = set.total_answers !== null ? set.total_answers : 0;
                
                row.innerHTML = `
                    <td>${set.question_set}</td>
                    <td>${set.count}</td>
                    <td>${totalAnswers}</td>
                    <td>
                        <a href="app.html?qs=${encodeURIComponent(set.question_set)}" class="btn btn-sm btn-primary">Practice</a>
                    </td>
                `;
                statsTableBody.appendChild(row);
            });
            
            // Add total row
            const totalCount = data.reduce((sum, set) => sum + set.count, 0);
            const totalAnswers = data.reduce((sum, set) => sum + (set.total_answers || 0), 0);
            const totalRow = document.createElement('tr');
            totalRow.className = 'table-secondary';
            totalRow.innerHTML = `
                <td><strong>Total</strong></td>
                <td><strong>${totalCount}</strong></td>
                <td><strong>${totalAnswers}</strong></td>
                <td>
                    <a href="app.html" class="btn btn-sm btn-outline-primary">Practice All</a>
                </td>
            `;
            statsTableBody.appendChild(totalRow);
        }
        
    } catch (error) {
        console.error('Error in fetchQuestionStats:', error);
        statsLoadingSpinner.style.display = 'none';
        statsErrorContainer.style.display = 'block';
        statsErrorContainer.textContent = 'Error loading statistics: ' + error.message;
    }
}

// Fetch file hash statistics
async function fetchFileHashStats() {
    try {
        // Show loading spinner
        fileHashLoadingSpinner.style.display = 'block';
        fileHashTableContainer.style.display = 'none';
        fileHashErrorContainer.style.display = 'none';
        
        // Query Supabase for file hash statistics
        const { data, error } = await window.supabaseClient
            .from('view_file_content_aggas')
            .select('*');
        
        if (error) {
            console.error('Error fetching file hash stats:', error);
            throw new Error(error.message);
        }
        
        console.log('Raw data from view:', data);
        
        // Hide spinner and show table
        fileHashLoadingSpinner.style.display = 'none';
        fileHashTableContainer.style.display = 'block';
        
        // Clear existing table data
        fileHashTableBody.innerHTML = '';
        
        if (!data || data.length === 0) {
            // No data found
            const noDataRow = document.createElement('tr');
            noDataRow.innerHTML = `
                <td colspan="7" class="text-center">No file hash statistics found in the database.</td>
            `;
            fileHashTableBody.appendChild(noDataRow);
        } else {
            // Add each file hash to the table
            data.forEach(file => {
                const row = document.createElement('tr');
                
                // Get the correct hash field based on database view
                let hashField = file.src_file_content_hash;
                
                // If the hash field doesn't exist, log all available fields and try alternatives
                if (!hashField) {
                    console.log('Available fields:', Object.keys(file));
                    
                    // Try alternative field names
                    hashField = file.src_file_content_hash || 
                                file.file_content_hash || 
                                file.content_hash || 
                                file.hash || 
                                Object.keys(file)[0]; // Fallback to first column
                    
                    console.log('Using hash field:', hashField);
                }
                
                // Format arrays for display - handle potential field name variations
                const questionSets = formatArrayField(file.questino_sets || file.question_sets);
                const filenames = formatArrayField(file.filenames);
                const descriptions = formatArrayField(file.descriptions);
                
                // Create a shortened hash for display (if we have a hash)
                let displayHash = 'Unknown';
                if (hashField) {
                    displayHash = `${hashField.substring(0, 8)}...${hashField.substring(hashField.length - 8)}`;
                }
                
                row.innerHTML = `
                    <td title="${hashField}">${displayHash}</td>
                    <td>${file.distinct_id_count || 0}</td>
                    <td>${file.question_hash_count || 0}</td>
                    <td>${questionSets}</td>
                    <td>${filenames}</td>
                    <td>${descriptions}</td>
                    <td>
                        <a href="app.html?fh=${encodeURIComponent(hashField)}" class="btn btn-sm btn-primary">Practice</a>
                    </td>
                `;
                fileHashTableBody.appendChild(row);
            });
        }
        
    } catch (error) {
        console.error('Error in fetchFileHashStats:', error);
        fileHashLoadingSpinner.style.display = 'none';
        fileHashErrorContainer.style.display = 'block';
        fileHashErrorContainer.textContent = 'Error loading file hash statistics: ' + error.message;
    }
}

// Helper function to format array fields from the database
function formatArrayField(arrayField) {
    if (!arrayField || !Array.isArray(arrayField) || arrayField.length === 0) {
        return 'N/A';
    }
    
    // Filter out null values and join with commas
    const filteredArray = arrayField.filter(item => item !== null);
    
    if (filteredArray.length === 0) {
        return 'N/A';
    }
    
    return filteredArray.join(', ');
}

// Helper function to show error message
function showError(message) {
    statsLoadingSpinner.style.display = 'none';
    statsErrorContainer.style.display = 'block';
    statsErrorContainer.textContent = message;
    
    urlParamsViewer.textContent = 'Error: ' + message;
    localStorageViewer.textContent = 'Error: ' + message;
} 