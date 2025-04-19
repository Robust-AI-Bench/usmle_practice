// Initialize Supabase client
const supabaseUrl = 'https://jrfpjposoiuqdadqjfww.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZnBqcG9zb2l1cWRhZHFqZnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNzU3NzgsImV4cCI6MjA2MDY1MTc3OH0.iAvSNpaJwqgKBwCaNuIt5wjGe1cLckNMK2Mo3bz2WXQ';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

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

// App state
let currentUser = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let questionSets = [];
let questionSetMaxIds = {};
let selectedAnswer = null;
let answeredQuestions = {};
let flaggedQuestions = {}; // Track which questions have been flagged

// Initialize the application
async function initApp() {
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
}

// Collect browser fingerprint for user linking
async function collectFingerprint() {
    if (window.Fingerprint2) {
        await new Promise(resolve => {
            Fingerprint2.get(components => {
                const fingerprint = Fingerprint2.x64hash128(components.map(c => c.value).join(''), 31);
                
                // Store the fingerprint with the user
                supabaseClient.from('user_fingerprints').insert({
                    user_id: currentUser.id,
                    fingerprint: fingerprint,
                    ip_address: '', // IP is captured server-side by Supabase
                    user_agent: navigator.userAgent
                }).then(({ error }) => {
                    if (error) console.error('Error storing fingerprint:', error);
                    resolve();
                });
            });
        });
    }
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
        let allQuestions = [];
        
        console.log('Loading questions with:', questionSets);
        console.log('Current max question IDs:', questionSetMaxIds);
        
        // Load questions from each question set based on percentage
        for (const setConfig of questionSets) {
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
                    allQuestions = allQuestions.concat(
                        data.map(q => ({ ...q, set: setConfig.name }))
                    );
                } else {
                    console.log(`No questions returned for ${setConfig.name}`);
                }
            } catch (setError) {
                console.error(`Error processing question set ${setConfig.name}:`, setError);
                // Continue with other sets instead of aborting completely
            }
        }
        
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
    questionNumber.textContent = `Question ${currentQuestionIndex + 1}/${currentQuestions.length}`;
    questionSet.textContent = question.set;
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
    
    // Update max question ID if needed
    if (!questionSetMaxIds[question.set] || question.question_id > questionSetMaxIds[question.set]) {
        questionSetMaxIds[question.set] = question.question_id;
        localStorage.setItem('questionSetMaxIds', JSON.stringify(questionSetMaxIds));
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
        
        // Use the same approach as loadQuestions
        let newQuestions = [];
        
        for (const setConfig of questionSets) {
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
                    newQuestions = newQuestions.concat(
                        data.map(q => ({ ...q, set: setConfig.name }))
                    );
                }
            } catch (setError) {
                console.error(`Error loading more questions from ${setConfig.name}:`, setError);
            }
        }
        
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