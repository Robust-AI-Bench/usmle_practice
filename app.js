// Initialize Supabase client if not already initialized
let supabaseClient;
if (typeof window.supabaseClient === 'undefined') {
    // Check if the variables are already declared in global scope
    if (typeof window.supabaseUrl === 'undefined') {
        const supabaseUrl = 'https://jrfpjposoiuqdadqjfww.supabase.co';
        window.supabaseUrl = supabaseUrl;
    }
    
    if (typeof window.supabaseAnonKey === 'undefined') {
        const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZnBqcG9zb2l1cWRhZHFqZnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNzU3NzgsImV4cCI6MjA2MDY1MTc3OH0.iAvSNpaJwqgKBwCaNuIt5wjGe1cLckNMK2Mo3bz2WXQ';
        window.supabaseAnonKey = supabaseAnonKey;
    }
    
    // Create the client if not already created
    supabaseClient = window.supabaseClient || supabase.createClient(window.supabaseUrl, window.supabaseAnonKey);
    window.supabaseClient = supabaseClient;
} else {
    // Use the existing client
    supabaseClient = window.supabaseClient;
}

// DOM Elements
const loadingElement = document.getElementById('loading');
const questionContainer = document.getElementById('question-container');
const questionNumber = document.getElementById('question-number');
const questionSet = document.getElementById('question-set');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedbackContainer = document.getElementById('feedback-container');
const resultFeedback = document.getElementById('result-feedback');
const correctAnswerDisplay = document.getElementById('correct-answer-display');
const flagAnswerBtn = document.getElementById('flag-answer-btn');
const continueBtn = document.getElementById('continue-btn');
const flagFormContainer = document.getElementById('flag-form-container');
const submitFlagBtn = document.getElementById('submit-flag-btn');
const cancelFlagBtn = document.getElementById('cancel-flag-btn');
const flagDetails = document.getElementById('flag-details');
const completionContainer = document.getElementById('completion-container');
const restartBtn = document.getElementById('restart-btn');
const debugInfo = document.getElementById('debug-info');
const debugQuestionId = document.getElementById('debug-question-id');
const debugQuestionSet = document.getElementById('debug-question-set');
const debugQuestionHash = document.getElementById('debug-question-hash');
const debugSrcQuestionHash = document.getElementById('debug-src-question-hash');
const debugSrcQuestionUid = document.getElementById('debug-src-question-uid');
const debugSrcFileContentHash = document.getElementById('debug-src-file-content-hash');

// App state
let currentUser = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let questionSets = [];
let questionSetMaxIds = {};
let fileHashMaxIds = {}; // Track max IDs for src_file_content_hash filtering
let selectedAnswer = null;
let answeredQuestions = {};
let flaggedQuestions = {}; // Track which questions have been flagged
let isDebugMode = false; // Track if debug mode is enabled
let specificQuestionSet = null; // Track if a specific question set is requested
let specificFileHash = null; // Track if a specific file hash is requested
let namedParam = null; // Store the value of the "named" parameter

// Initialize the application
async function initApp() {
    // Parse URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    
    // Set debug mode if debug=1 or debug=true
    isDebugMode = debugParam === '1' || debugParam === 'true';
    console.log('Debug mode:', isDebugMode);
    
    // Hide question set badge if not in debug mode
    if (!isDebugMode) {
        questionSet.style.display = 'none';
    }
    
    // Check for specific question set filter
    specificQuestionSet = urlParams.get('qs');
    if (specificQuestionSet) {
        console.log(`Filtering to specific question set: ${specificQuestionSet}`);
    }
    
    // Check for specific file hash filter (support both full name and shorthand 'fh')
    specificFileHash = urlParams.get('src_file_content_hash') || urlParams.get('fh');
    if (specificFileHash) {
        // Trim any whitespace and ensure proper formatting
        specificFileHash = specificFileHash.trim();
        console.log(`Filtering to specific file hash: ${specificFileHash}`);
    }
    
    // Get "named" parameter from URL
    namedParam = urlParams.get('named');
    if (namedParam) {
        console.log(`Named parameter: ${namedParam}`);
    }
    
    await checkOrCreateUser();
    await loadConfig();
    await loadQuestions();
}

// Check for existing user or create a new anonymous user
async function checkOrCreateUser() {
    // Check if we have a user ID in local storage
    const storedUserId = localStorage.getItem('userId');
    
    if (storedUserId) {
        currentUser = { id: storedUserId };
        console.log('Using existing user:', currentUser.id);
    } else {
        // Create anonymous user
        try {
            const { data, error } = await supabaseClient.auth.signInAnonymously();
            
            if (error) throw error;
            
            currentUser = data.user;
            localStorage.setItem('userId', currentUser.id);
            console.log('Created new anonymous user:', currentUser.id);
            
            // Collect fingerprint for linking users
            await collectFingerprint();
        } catch (error) {
            console.error('Error creating anonymous user:', error);
            alert('Error initializing user. Please refresh the page.');
        }
    }
    
    // Load previously answered questions from local storage
    const storedAnswers = localStorage.getItem('answeredQuestions');
    if (storedAnswers) {
        answeredQuestions = JSON.parse(storedAnswers);
    }
    
    // Load max question IDs from local storage
    const storedMaxIds = localStorage.getItem('questionSetMaxIds');
    if (storedMaxIds) {
        questionSetMaxIds = JSON.parse(storedMaxIds);
    }
    
    // Load max file hash IDs from local storage
    const storedFileHashMaxIds = localStorage.getItem('fileHashMaxIds');
    if (storedFileHashMaxIds) {
        fileHashMaxIds = JSON.parse(storedFileHashMaxIds);
    }
}

// Collect browser fingerprint for user linking
async function collectFingerprint() {
    try {
        // Get IP info with timeout
        let ipInfoData = null;
        try {
            ipInfoData = await getIpInfo();
            console.log('Successfully collected IP info');
        } catch (ipError) {
            console.warn('Could not collect IP info:', ipError);
        }
        
        if (window.Fingerprint2) {
            await new Promise(resolve => {
                Fingerprint2.get(components => {
                    const fingerprint = Fingerprint2.x64hash128(components.map(c => c.value).join(''), 31);
                    
                    // Store the fingerprint with the user
                    supabaseClient.from('user_fingerprints').insert({
                        user_id: currentUser.id,
                        fingerprint: fingerprint,
                        ip_address: '', // IP is captured server-side by Supabase
                        user_agent: navigator.userAgent,
                        ip_info_io: ipInfoData, // Add the IP info data as JSONB
                        named: namedParam // Add the named parameter
                    }).then(({ error }) => {
                        if (error) console.error('Error storing fingerprint:', error);
                        resolve();
                    });
                });
            });
        }
    } catch (error) {
        console.error('Error in collectFingerprint:', error);
    }
}

// Get IP info from ipinfo.io with timeout
async function getIpInfo() {
    // First check if we already have IP info in local storage
 

    return new Promise((resolve, reject) => {
        // Set timeout to 3 seconds
        const timeoutId = setTimeout(() => {
            reject(new Error('Request to ipinfo.io timed out'));
        }, 3000);
        
        fetch('https://ipinfo.io', {
            headers: {
                'Accept': 'application/json'
            }
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Save to localStorage on success
            try {
                localStorage.setItem('ipInfo', JSON.stringify(data));
                console.log('Saved IP info to local storage');
            } catch (storageError) {
                console.warn('Could not save IP info to local storage:', storageError);
            }
            resolve(data);
        })
        .catch(error => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}

// Load configuration from database
async function loadConfig() {
    try {
        console.log('Loading configuration from database...');
        
        const { data, error } = await supabaseClient
            .from('configuration')
            .select('*')
            .limit(1)
            .single();
        
        if (error) {
            console.error('Error loading configuration:', error);
            throw error;
        }
        
        if (!data || !data.question_sets) {
            console.warn('No configuration found or missing question_sets, using defaults');
            // Default to the required configuration if none exists
            questionSets = [
                { name: 'medQA', percentage: 50, max_answers: null },
                { name: 'synthNew', percentage: 50, max_answers: 5 }
            ];
        } else {
            // Extract question sets and percentages
            questionSets = data.question_sets;
            console.log('Loaded configuration from database:', questionSets);
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
        // Default to the required configuration if error
        questionSets = [
            { name: 'medQA', percentage: 50, max_answers: null },
            { name: 'synthNew', percentage: 50, max_answers: 5 }
        ];
        console.log('Using default configuration due to error:', questionSets);
    }
}

// Load questions from the database
async function loadQuestions() {
    loadingElement.style.display = 'block';
    questionContainer.style.display = 'none';
    
    try {
        let questionsFromSets = {}; // Store questions organized by set
        
        console.log('Loading questions with:', questionSets);
        console.log('Current max question IDs:', questionSetMaxIds);
        if (specificFileHash) {
            console.log('Current max file hash IDs:', fileHashMaxIds);
        }
        
        // If src_file_content_hash is specified, we ignore question sets
        if (specificFileHash) {
            console.log(`Loading questions with file hash: ${specificFileHash}`);
            
            try {
                // First do a count query to see if any questions exist with this hash
                const { count: questionCount, error: countError } = await supabaseClient
                    .from('questions')
                    .select('*', { count: 'exact', head: true })
                    .eq('src_file_content_hash', specificFileHash);
                
                if (countError) {
                    console.error(`Error counting questions with hash ${specificFileHash}:`, countError);
                } else {
                    console.log(`Total questions with hash ${specificFileHash}: ${questionCount}`);
                }
                
                // Get the max ID we've seen for this hash
                const maxId = fileHashMaxIds[specificFileHash] || 0;
                
                // Log the exact query we're about to make for debugging
                console.log(`Making query with file hash: "${specificFileHash}"`);
                console.log(`Hash type: ${typeof specificFileHash}, length: ${specificFileHash.length}`);
                
                // Try a direct query to verify hash values
                const { data: verifyData, error: verifyError } = await supabaseClient
                    .from('questions')
                    .select('src_file_content_hash')
                    .limit(10);
                
                if (!verifyError && verifyData && verifyData.length > 0) {
                    console.log('Sample hashes in database:');
                    
                    // Check if the hash exists in any form (case insensitive)
                    let foundExactMatch = false;
                    let foundCaseInsensitiveMatch = false;
                    let matchedHash = null;
                    
                    verifyData.forEach(item => {
                        if (item.src_file_content_hash) {
                            console.log(`- "${item.src_file_content_hash}" (${typeof item.src_file_content_hash}, ${item.src_file_content_hash.length})`);
                            
                            // Check for exact match
                            if (item.src_file_content_hash === specificFileHash) {
                                console.log(`  ✓ EXACT MATCH with user-provided hash`);
                                foundExactMatch = true;
                                matchedHash = item.src_file_content_hash;
                            } 
                            // Check for case-insensitive match
                            else if (item.src_file_content_hash.toLowerCase() === specificFileHash.toLowerCase()) {
                                console.log(`  ✓ CASE-INSENSITIVE MATCH with user-provided hash`);
                                foundCaseInsensitiveMatch = true;
                                matchedHash = item.src_file_content_hash;
                            }
                        } else {
                            console.log(`- null or undefined hash`);
                        }
                    });
                    
                    // If we found a case-insensitive match but not an exact match, use the exact case from database
                    if (!foundExactMatch && foundCaseInsensitiveMatch && matchedHash) {
                        console.log(`Using exact case from database: "${matchedHash}" instead of "${specificFileHash}"`);
                        specificFileHash = matchedHash;
                    }
                }
                
                // Execute the query to get questions by file hash
                const { data, error } = await supabaseClient
                    .from('questions')
                    .select()
                    .eq('src_file_content_hash', specificFileHash)
                    .gt('question_id', maxId)
                    .order('question_id', { ascending: true })
                    .limit(20);
                
                if (error) {
                    console.error(`Error querying questions with hash ${specificFileHash}:`, error);
                    throw error;
                }
                
                console.log(`Received ${data ? data.length : 0} questions with hash ${specificFileHash}`);
                
                if (data && data.length > 0) {
                    // Store all questions in a single set for simplicity
                    const setName = 'file_hash_filtered';
                    questionsFromSets[setName] = data.map(q => ({ 
                        ...q, 
                        set: setName,
                        src_file_content_hash: specificFileHash
                    }));
                } else {
                    console.log(`No questions returned for hash ${specificFileHash}`);
                }
            } catch (error) {
                console.error(`Error processing file hash query:`, error);
            }
        } else {
            // Filter question sets if a specific set is requested
            let setsToLoad = questionSets;
            if (specificQuestionSet) {
                // Only load the specified question set with 100% percentage
                setsToLoad = questionSets.filter(set => set.name === specificQuestionSet);
                
                // If the requested set doesn't exist, create a temporary configuration for it
                if (setsToLoad.length === 0) {
                    setsToLoad = [{ name: specificQuestionSet, percentage: 100, max_answers: null }];
                } else {
                    // Override the percentage to 100%
                    setsToLoad = setsToLoad.map(set => ({ ...set, percentage: 100 }));
                }
                
                console.log(`Filtering to load only question set: ${specificQuestionSet}`, setsToLoad);
            }
            
            // Initialize question arrays for each set
            setsToLoad.forEach(set => {
                questionsFromSets[set.name] = [];
            });
            
            // Load questions from each question set based on percentage
            for (const setConfig of setsToLoad) {
                const maxId = questionSetMaxIds[setConfig.name] || 0;
                const count = Math.floor(20 * (setConfig.percentage / 100));
                
                if (count <= 0) continue;
                
                console.log(`Loading ${count} questions from ${setConfig.name} with maxId ${maxId}`);
                
                try {
                    // First do a count query to see if any questions exist
                    const { count: questionCount, error: countError } = await supabaseClient
                        .from('questions')
                        .select('*', { count: 'exact', head: true })
                        .eq('question_set', setConfig.name);
                    
                    if (countError) {
                        console.error(`Error counting questions for ${setConfig.name}:`, countError);
                    } else {
                        console.log(`Total questions in ${setConfig.name} set: ${questionCount}`);
                    }
                    
                    // Execute the query with correct Supabase syntax
                    let query = supabaseClient
                        .from('questions')
                        .select('*')
                        .eq('question_set', setConfig.name)
                        .gt('question_id', maxId)
                        .order('question_id', { ascending: true });
                    
                    // Add filter for max answers if configured
                    if (setConfig.max_answers !== null) {
                        query = query.lt('answer_count', setConfig.max_answers);
                    }
                    
                    // Apply limit and execute
                    const { data, error } = await query.limit(count);
                    
                    if (error) {
                        console.error(`Error querying questions from ${setConfig.name}:`, error);
                        throw error;
                    }
                    
                    console.log(`Received ${data ? data.length : 0} questions from ${setConfig.name}`);
                    
                    if (data && data.length > 0) {
                        // Store questions by set
                        questionsFromSets[setConfig.name] = data.map(q => ({ ...q, set: setConfig.name }));
                    } else {
                        console.log(`No questions returned for ${setConfig.name}`);
                    }
                } catch (setError) {
                    console.error(`Error processing question set ${setConfig.name}:`, setError);
                    // Continue with other sets instead of aborting completely
                }
            }
        }
        
        // Interleave questions from different sets
        let allQuestions = interleaveQuestions(questionsFromSets);
        
        if (allQuestions.length === 0) {
            console.log('No questions found');
            // Try a simpler query to test database access
            try {
                const { count: questionCount, error: testError } = await supabaseClient
                    .from('questions')
                    .select('*', { count: 'exact', head: true });
                
                if (testError) {
                    console.error('Test query failed:', testError);
                } else {
                    console.log('Test query succeeded. Total questions in database:', questionCount);
                }
            } catch (testError) {
                console.error('Error during test query:', testError);
            }
            
            completionContainer.style.display = 'block';
            loadingElement.style.display = 'none';
            return;
        }
        
        console.log(`Loaded a total of ${allQuestions.length} questions`);
        currentQuestions = allQuestions;
        currentQuestionIndex = 0;
        
        displayQuestion();
    } catch (error) {
        console.error('Error loading questions:', error);
        loadingElement.innerHTML = `<p class="text-danger">Error loading questions. Please refresh the page. Details: ${error.message}</p>`;
    }
}

/**
 * Interleave questions from different sets to ensure randomization
 * @param {Object} questionsFromSets - Object with question sets as keys and arrays of questions as values
 * @returns {Array} Interleaved questions from all sets
 */
function interleaveQuestions(questionsFromSets) {
    // First get all set names that have questions
    const setsWithQuestions = Object.keys(questionsFromSets).filter(
        setName => questionsFromSets[setName].length > 0
    );
    
    if (setsWithQuestions.length === 0) {
        return [];
    }
    
    if (setsWithQuestions.length === 1) {
        // If only one set has questions
        const setName = setsWithQuestions[0];
        
        // Special case: If it's a file hash filtered set, don't shuffle
        // to maintain question_id ordering
        if (setName === 'file_hash_filtered') {
            return [...questionsFromSets[setName]];
        }
        
        // For regular question sets, shuffle as before
        return shuffleArray([...questionsFromSets[setName]]);
    }
    
    // Get the maximum number of questions from any set
    const maxQuestions = Math.max(...setsWithQuestions.map(
        setName => questionsFromSets[setName].length
    ));
    
    // Create a shuffled order of sets to use for interleaving
    let setOrder = [];
    for (let i = 0; i < maxQuestions; i++) {
        // For each position, add all sets that still have questions at this index
        const availableSets = setsWithQuestions.filter(
            setName => i < questionsFromSets[setName].length
        );
        // Add them in random order
        setOrder = setOrder.concat(shuffleArray([...availableSets]));
    }
    
    // Use the set order to build the interleaved questions array
    const interleavedQuestions = [];
    const usedIndices = {}; // Track which indices we've used for each set
    
    // Initialize used indices counters
    setsWithQuestions.forEach(setName => {
        usedIndices[setName] = 0;
    });
    
    // Build the interleaved array
    setOrder.forEach(setName => {
        if (usedIndices[setName] < questionsFromSets[setName].length) {
            interleavedQuestions.push(questionsFromSets[setName][usedIndices[setName]]);
            usedIndices[setName]++;
        }
    });
    
    return interleavedQuestions;
}

/**
 * Shuffle an array using the Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Display the current question
function displayQuestion() {
    if (currentQuestionIndex >= currentQuestions.length) {
        completionContainer.style.display = 'block';
        questionContainer.style.display = 'none';
        loadingElement.style.display = 'none';
        return;
    }
    
    const question = currentQuestions[currentQuestionIndex];
    
    // Check if we should preload more questions (when 90% complete)
    if (currentQuestionIndex >= Math.floor(currentQuestions.length * 0.9) && 
        currentQuestions.length < 20) {
        loadMoreQuestions();
    }
    
    // Update the question display
    if (isDebugMode) {
        // When in debug mode, show question ID and other debug info
        questionNumber.textContent = `Question ${currentQuestionIndex + 1}/${currentQuestions.length} [ID: ${question.question_id}]`;
        questionSet.textContent = question.set;
        questionSet.style.display = 'block';
        
        // Show and populate debug info
        debugInfo.style.display = 'block';
        debugQuestionId.textContent = `question_id: ${question.question_id || 'N/A'}`;
        debugQuestionSet.textContent = `question_set: ${question.question_set || 'N/A'}`;
        debugQuestionHash.textContent = `question_hash: ${question.question_hash || 'N/A'}`;
        debugSrcQuestionHash.textContent = `src_question_hash: ${question.src_question_hash || 'N/A'}`;
        debugSrcQuestionUid.textContent = `src_question_uid: ${question.src_question_uid || 'N/A'}`;
        debugSrcFileContentHash.textContent = `src_file_content_hash: ${question.src_file_content_hash || 'N/A'}`;
    } else {
        // Regular display without debug info
        questionNumber.textContent = `Question ${currentQuestionIndex + 1}/${currentQuestions.length}`;
        questionSet.style.display = 'none';
        debugInfo.style.display = 'none';
    }
    
    questionText.textContent = question.question;
    
    // Clear the options container
    optionsContainer.innerHTML = '';
    
    // Add the options
    const options = JSON.parse(question.options);
    Object.keys(options).forEach(key => {
        const optionBtn = document.createElement('button');
        optionBtn.className = 'option-btn';
        optionBtn.dataset.option = key;
        
        const letterSpan = document.createElement('span');
        letterSpan.className = 'option-letter';
        letterSpan.textContent = key;
        
        optionBtn.appendChild(letterSpan);
        optionBtn.appendChild(document.createTextNode(options[key]));
        
        optionBtn.addEventListener('click', () => selectOption(optionBtn, key));
        
        optionsContainer.appendChild(optionBtn);
    });
    
    // Add special options that are always displayed
    // 1. None of the above
    const noneAboveBtn = document.createElement('button');
    noneAboveBtn.className = 'option-btn special-option';
    noneAboveBtn.dataset.option = 'X';
    noneAboveBtn.dataset.special = 'true';
    
    const noneAboveSpan = document.createElement('span');
    noneAboveSpan.className = 'option-letter';
    noneAboveSpan.textContent = 'X';
    
    noneAboveBtn.appendChild(noneAboveSpan);
    noneAboveBtn.appendChild(document.createTextNode('None of the above'));
    
    noneAboveBtn.addEventListener('click', () => selectOption(noneAboveBtn, 'X'));
    
    // 2. Nonsense question
    const nonsenseBtn = document.createElement('button');
    nonsenseBtn.className = 'option-btn special-option';
    nonsenseBtn.dataset.option = 'Y';
    nonsenseBtn.dataset.special = 'true';
    
    const nonsenseSpan = document.createElement('span');
    nonsenseSpan.className = 'option-letter';
    nonsenseSpan.textContent = 'Y';
    
    nonsenseBtn.appendChild(nonsenseSpan);
    nonsenseBtn.appendChild(document.createTextNode('Nonsense question'));
    
    nonsenseBtn.addEventListener('click', () => selectOption(nonsenseBtn, 'Y'));
    
    // Add a separator before special options
    const separator = document.createElement('hr');
    separator.className = 'special-options-separator';
    optionsContainer.appendChild(separator);
    
    // Add the special options to the container
    optionsContainer.appendChild(noneAboveBtn);
    optionsContainer.appendChild(nonsenseBtn);
    
    // Reset state
    selectedAnswer = null;
    feedbackContainer.style.display = 'none';
    flagFormContainer.style.display = 'none';
    
    // Check if the current question has been flagged and update flag button visibility
    const questionKey = `${question.question_id}-${question.question_hash}`;
    if (flaggedQuestions[questionKey]) {
        flagAnswerBtn.style.display = 'none';
    } else {
        flagAnswerBtn.style.display = 'block';
    }
    
    // Show the question container and hide loading
    questionContainer.style.display = 'block';
    loadingElement.style.display = 'none';
}

// Handle option selection
function selectOption(optionBtn, option) {
    // Clear previous selection
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Mark the new selection
    optionBtn.classList.add('selected');
    selectedAnswer = option;
    
    // Submit the answer after a short delay
    setTimeout(() => submitAnswer(), 300);
}

// Submit the selected answer
async function submitAnswer() {
    if (!selectedAnswer) return;
    
    const question = currentQuestions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === currentQuestions.length - 1;
    
    // Check if this is a special option (X or Y)
    const isSpecialOption = selectedAnswer === 'X' || selectedAnswer === 'Y';
    
    // For special options, they are always considered incorrect in terms of scoring
    const isCorrect = isSpecialOption ? false : selectedAnswer === question.answer_idx;
    
    // Update UI to show the result
    document.querySelectorAll('.option-btn').forEach(btn => {
        const option = btn.dataset.option;
        
        if (option === question.answer_idx) {
            btn.classList.add('correct');
        } else if (option === selectedAnswer && !isCorrect) {
            btn.classList.add('incorrect');
        }
        
        // Disable all buttons
        btn.disabled = true;
    });
    
    // Show feedback based on whether it's a special option or not
    if (isSpecialOption) {
        if (selectedAnswer === 'X') {
            resultFeedback.className = 'alert alert-warning';
            resultFeedback.textContent = 'You selected "None of the above"';
        } else {
            resultFeedback.className = 'alert alert-warning';
            resultFeedback.textContent = 'You marked this as a nonsense question';
        }
    } else {
        resultFeedback.className = isCorrect ? 'alert alert-success' : 'alert alert-danger';
        resultFeedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    }
    
    correctAnswerDisplay.innerHTML = `<p>The correct answer is: <strong>${question.answer_idx}. ${JSON.parse(question.options)[question.answer_idx]}</strong></p>`;
    feedbackContainer.style.display = 'block';
    
    // If this is the last question, modify the UI
    if (isLastQuestion) {
        // Hide the continue button and show the completion container instead
        continueBtn.style.display = 'none';
        
        // Change text on restart button
        const restartBtnText = document.querySelector('#restart-btn');
        if (restartBtnText) {
            restartBtnText.textContent = 'Load More Questions';
        }
        
        // Show completion container after a short delay
        setTimeout(() => {
            completionContainer.style.display = 'block';
        }, 2000);
    }
    
    // Save the answer to local storage and remote database
    saveAnswer(question, selectedAnswer, isCorrect);
    
    // Automatically show flag form for special options
    if (isSpecialOption) {
        setTimeout(() => {
            flagAnswerBtn.click();
            
            // Pre-select the appropriate flag reason based on the special option
            if (selectedAnswer === 'X') {
                document.getElementById('incorrect-answer').checked = true;
            } else if (selectedAnswer === 'Y') {
                document.getElementById('confusing-question').checked = true;
            }
        }, 500);
    }
}

// Save the user's answer
async function saveAnswer(question, selectedOption, isCorrect) {
    // Save to local storage for duplicate checking
    const answerKey = `${question.question_id}-${question.question_hash}`;
    answeredQuestions[answerKey] = {
        question_id: question.question_id,
        selected_option: selectedOption,
        is_correct: isCorrect,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('answeredQuestions', JSON.stringify(answeredQuestions));
    
    // Check for potential duplicates
    if (Object.keys(answeredQuestions).filter(key => key.startsWith(`${question.question_id}-`)).length > 1) {
        console.warn('Potential duplicate answer detected for question ID:', question.question_id);
    }
    
    // Save to the database
    try {
        const { error } = await supabaseClient.from('user_answers').insert({
            user_id: currentUser.id,
            question_id: question.question_id,
            question_hash: question.question_hash,
            question_set: question.set,
            selected_option: selectedOption,
            is_correct: isCorrect
        });
        
        if (error) throw error;
    } catch (error) {
        console.error('Error saving answer:', error);
    }

    // Update max question ID for question set if needed
    if (!questionSetMaxIds[question.set] || question.question_id > questionSetMaxIds[question.set]) {
        questionSetMaxIds[question.set] = question.question_id;
        localStorage.setItem('questionSetMaxIds', JSON.stringify(questionSetMaxIds));
    }
    
    // Update max question ID for file hash if needed
    if (question.src_file_content_hash) {
        const fileHash = question.src_file_content_hash;
        if (!fileHashMaxIds[fileHash] || question.question_id > fileHashMaxIds[fileHash]) {
            fileHashMaxIds[fileHash] = question.question_id;
            localStorage.setItem('fileHashMaxIds', JSON.stringify(fileHashMaxIds));
        }
    }
}

// Handle flagging a question
flagAnswerBtn.addEventListener('click', () => {
    feedbackContainer.style.display = 'none';
    flagFormContainer.style.display = 'block';
    
    // Clear previous selections
    document.querySelectorAll('input[name="flag-reason"]').forEach(input => {
        input.checked = false;
    });
    flagDetails.value = '';
});

// Handle canceling the flag
cancelFlagBtn.addEventListener('click', () => {
    flagFormContainer.style.display = 'none';
    feedbackContainer.style.display = 'block';
});

// Handle submitting the flag
submitFlagBtn.addEventListener('click', async () => {
    const question = currentQuestions[currentQuestionIndex];
    const selectedReason = document.querySelector('input[name="flag-reason"]:checked');
    
    if (!selectedReason) {
        alert('Please select a reason for flagging this question.');
        return;
    }
    
    try {
        const { error } = await supabaseClient.from('question_flags').insert({
            user_id: currentUser.id,
            question_id: question.question_id,
            question_hash: question.question_hash,
            question_set: question.set,
            flag_reason: selectedReason.value,
            details: flagDetails.value.trim() || null
        });
        
        if (error) throw error;
        
        // Remove alert message but keep the UI transitions
        flagFormContainer.style.display = 'none';
        
        // Track this question as flagged
        const questionKey = `${question.question_id}-${question.question_hash}`;
        flaggedQuestions[questionKey] = true;
        
        // Remove the flag button for this specific question only
        flagAnswerBtn.style.display = 'none';
        
        // Show the feedback container
        feedbackContainer.style.display = 'block';
    } catch (error) {
        console.error('Error submitting flag:', error);
        alert('Error submitting feedback. Please try again.');
    }
});

// Continue to the next question
continueBtn.addEventListener('click', () => {
    currentQuestionIndex++;
    displayQuestion();
});

// Restart the quiz
restartBtn.addEventListener('click', () => {
    completionContainer.style.display = 'none';
    // Show the continue button in case it was hidden
    continueBtn.style.display = 'block';
    loadQuestions();
});

// Load more questions in the background
async function loadMoreQuestions() {
    console.log('Loading more questions in the background...');
    
    try {
        // Create a copy of the current questions
        const currentQuestionsSnapshot = [...currentQuestions];
        const currentIndexSnapshot = currentQuestionIndex;
        
        // If src_file_content_hash is specified, load more questions by file hash
        if (specificFileHash) {
            console.log(`Loading more questions with file hash: ${specificFileHash}`);
            
            try {
                // Get the max ID we've seen for this hash
                const maxId = fileHashMaxIds[specificFileHash] || 0;
                
                // Log the exact query we're about to make for debugging
                console.log(`Loading more questions with file hash: "${specificFileHash}"`);
                console.log(`Hash type: ${typeof specificFileHash}, length: ${specificFileHash.length}`);
                
                // Execute the query to get more questions by file hash
                const { data, error } = await supabaseClient
                    .from('questions')
                    .select()
                    .eq('src_file_content_hash', specificFileHash)
                    .gt('question_id', maxId)
                    .order('question_id', { ascending: true })
                    .limit(10); // Load 10 more questions
                
                if (error) {
                    console.error(`Error querying more questions with hash ${specificFileHash}:`, error);
                    return;
                }
                
                console.log(`Received ${data ? data.length : 0} more questions with hash ${specificFileHash}`);
                
                if (data && data.length > 0) {
                    // Store all questions in a single set for simplicity
                    const setName = 'file_hash_filtered';
                    const newQuestions = data.map(q => ({ 
                        ...q, 
                        set: setName,
                        src_file_content_hash: specificFileHash
                    }));
                    
                    // Add to current questions without shuffling
                    currentQuestions = [...currentQuestions, ...newQuestions];
                    console.log(`Added ${newQuestions.length} more questions by file hash`);
                    
                    // Always show continue button when more questions are loaded
                    continueBtn.style.display = 'block';
                } else {
                    console.log(`No more questions available for hash ${specificFileHash}`);
                }
            } catch (error) {
                console.error(`Error loading more questions by file hash:`, error);
            }
            
            return;
        }
        
        // Use the same approach as loadQuestions for question sets
        let questionsFromSets = {}; // Store questions from each set
        
        // Filter question sets if a specific set is requested
        let setsToLoad = questionSets;
        if (specificQuestionSet) {
            // Only load the specified question set with 100% percentage
            setsToLoad = questionSets.filter(set => set.name === specificQuestionSet);
            
            // If the requested set doesn't exist, create a temporary configuration for it
            if (setsToLoad.length === 0) {
                setsToLoad = [{ name: specificQuestionSet, percentage: 100, max_answers: null }];
            } else {
                // Override the percentage to 100%
                setsToLoad = setsToLoad.map(set => ({ ...set, percentage: 100 }));
            }
        }
        
        // Initialize question arrays for each set
        setsToLoad.forEach(set => {
            questionsFromSets[set.name] = [];
        });
        
        for (const setConfig of setsToLoad) {
            const maxId = questionSetMaxIds[setConfig.name] || 0;
            const count = Math.floor(10 * (setConfig.percentage / 100)); // Load 10 more questions
            
            if (count <= 0) continue;
            
            try {
                // Query with the same format as loadQuestions
                let query = supabaseClient
                    .from('questions')
                    .select('*')
                    .eq('question_set', setConfig.name)
                    .gt('question_id', maxId)
                    .order('question_id', { ascending: true });
                
                if (setConfig.max_answers !== null) {
                    query = query.lt('answer_count', setConfig.max_answers);
                }
                
                const { data, error } = await query.limit(count);
                
                if (error) {
                    console.error(`Error querying more questions from ${setConfig.name}:`, error);
                    continue;
                }
                
                if (data && data.length > 0) {
                    // Store questions by set
                    questionsFromSets[setConfig.name] = data.map(q => ({ ...q, set: setConfig.name }));
                }
            } catch (setError) {
                console.error(`Error loading more questions from ${setConfig.name}:`, setError);
            }
        }
        
        // Interleave questions from different sets
        const newQuestions = interleaveQuestions(questionsFromSets);
        
        if (newQuestions.length > 0) {
            console.log(`Loaded ${newQuestions.length} more questions`);
            currentQuestions = [...currentQuestions, ...newQuestions];
            
            // Always show continue button when more questions are loaded
            continueBtn.style.display = 'block';
        } else {
            console.log('No more questions available');
        }
    } catch (error) {
        console.error('Error loading more questions:', error);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initApp); 