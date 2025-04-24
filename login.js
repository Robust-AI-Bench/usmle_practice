// Initialize Supabase client
const supabaseUrl = 'https://jrfpjposoiuqdadqjfww.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZnBqcG9zb2l1cWRhZHFqZnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNzU3NzgsImV4cCI6MjA2MDY1MTc3OH0.iAvSNpaJwqgKBwCaNuIt5wjGe1cLckNMK2Mo3bz2WXQ';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

// Redirect URL after successful authentication
const redirectUrl = 'https://peerbench-qa.vercel.app/';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const loginSuccess = document.getElementById('loginSuccess');

const signupForm = document.getElementById('signupForm');
const signupEmail = document.getElementById('signupEmail');
const signupPassword = document.getElementById('signupPassword');
const confirmPassword = document.getElementById('confirmPassword');
const signupError = document.getElementById('signupError');
const signupSuccess = document.getElementById('signupSuccess');

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Hide previous error messages
    loginError.style.display = 'none';
    loginSuccess.style.display = 'none';
    
    try {
        // Sign in with email and password
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: loginEmail.value,
            password: loginPassword.value
        });
        
        if (error) throw error;
        
        // Show success message
        loginSuccess.style.display = 'block';
        
        // Store user information
        localStorage.setItem('userId', data.user.id);
        
        // Redirect after successful login
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
        
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = error.message || 'Failed to log in. Please check your credentials.';
        loginError.style.display = 'block';
    }
});

// Handle signup form submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Hide previous error messages
    signupError.style.display = 'none';
    signupSuccess.style.display = 'none';
    
    // Validate password match
    if (signupPassword.value !== confirmPassword.value) {
        signupError.textContent = 'Passwords do not match';
        signupError.style.display = 'block';
        return;
    }
    
    // Validate password length
    if (signupPassword.value.length < 6) {
        signupError.textContent = 'Password must be at least 6 characters long';
        signupError.style.display = 'block';
        return;
    }
    
    try {
        // Sign up with email and password
        const { data, error } = await supabaseClient.auth.signUp({
            email: signupEmail.value,
            password: signupPassword.value,
            options: {
                emailRedirectTo: redirectUrl
            }
        });
        
        if (error) throw error;
        
        // Show success message
        signupSuccess.style.display = 'block';
        
        // Clear form
        signupForm.reset();
        
    } catch (error) {
        console.error('Signup error:', error);
        signupError.textContent = error.message || 'Failed to create account. Please try again.';
        signupError.style.display = 'block';
    }
});

// Check if user is already authenticated
async function checkSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    
    if (data && data.session) {
        // User is already logged in, redirect
        window.location.href = redirectUrl;
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
}); 