// Initialize Supabase client
const supabaseUrl = 'https://jrfpjposoiuqdadqjfww.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZnBqcG9zb2l1cWRhZHFqZnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNzU3NzgsImV4cCI6MjA2MDY1MTc3OH0.iAvSNpaJwqgKBwCaNuIt5wjGe1cLckNMK2Mo3bz2WXQ';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

// Redirect URL after successful authentication - point to index.html instead of app.html
const redirectUrl = 'index.html';

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

// Magic Link Elements
const magicLinkForm = document.getElementById('magicLinkForm');
const magicLinkEmail = document.getElementById('magicLinkEmail');
const magicLinkError = document.getElementById('magicLinkError');
const magicLinkSuccess = document.getElementById('magicLinkSuccess');

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

// Handle magic link form submission
magicLinkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Hide previous error messages
    magicLinkError.style.display = 'none';
    magicLinkSuccess.style.display = 'none';
    
    try {
        // Request magic link email
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: magicLinkEmail.value,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: redirectUrl
            }
        });
        
        if (error) throw error;
        
        // Show success message
        magicLinkSuccess.style.display = 'block';
        
        // Clear form
        magicLinkForm.reset();
        
    } catch (error) {
        console.error('Magic link error:', error);
        magicLinkError.textContent = error.message || 'Failed to send magic link. Please try again.';
        magicLinkError.style.display = 'block';
    }
});

// Check if user is already authenticated - NO automatic redirect
async function checkSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    
    // We no longer force redirect to allow anonymous users
    // Just storing the session info if it exists
    if (data && data.session) {
        localStorage.setItem('userId', data.session.user.id);
    }
}

// Check for OTP confirmation from URL
async function checkOtpConfirmation() {
    // Get URL hash parameters
    const hashParams = new URLSearchParams(window.location.hash.substr(1));
    const type = hashParams.get('type');
    const token = hashParams.get('access_token');
    
    // Check if this is an OTP verification
    if (type === 'recovery' || type === 'magiclink') {
        try {
            // Handle the redirect automatically
            const { data, error } = await supabaseClient.auth.getUser(token);
            
            if (error) throw error;
            
            // User is authenticated, store info and redirect
            if (data && data.user) {
                localStorage.setItem('userId', data.user.id);
            }
            
            alert('You have been successfully authenticated!');
            window.location.href = redirectUrl;
            
        } catch (error) {
            console.error('Auth confirmation error:', error);
            alert('Failed to verify your authentication. Please try again.');
        }
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    checkOtpConfirmation();
}); 