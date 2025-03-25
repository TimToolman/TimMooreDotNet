/**
 * Login JavaScript for Tim Moore's Personal Website
 * Handles login form functionality
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize form validation
    initFormValidation();
    
    // Initialize password toggle
    initPasswordToggle();
    
    // Initialize form submission handler
    handleFormSubmit();
});

/**
 * Initialize form validation
 */
function initFormValidation() {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const usernameError = document.getElementById('username-error');
    const passwordError = document.getElementById('password-error');
    
    if (!loginForm || !usernameInput || !passwordInput) return;
    
    // Add input event listeners for real-time validation
    usernameInput.addEventListener('input', () => {
        validateUsername(usernameInput, usernameError);
    });
    
    passwordInput.addEventListener('input', () => {
        validatePassword(passwordInput, passwordError);
    });
    
    // Add form submit event listener
    loginForm.addEventListener('submit', (e) => {
        // Validate username
        const isUsernameValid = validateUsername(usernameInput, usernameError);
        
        // Validate password
        const isPasswordValid = validatePassword(passwordInput, passwordError);
        
        // If either validation fails, prevent form submission
        if (!isUsernameValid || !isPasswordValid) {
            e.preventDefault();
        }
    });
    
    /**
     * Validate username field
     * @param {HTMLInputElement} input - Username input element
     * @param {HTMLElement} errorElement - Error message element
     * @returns {boolean} - Whether the username is valid
     */
    function validateUsername(input, errorElement) {
        const value = input.value.trim();
        
        // Clear previous error
        errorElement.textContent = '';
        
        // Check if empty
        if (!value) {
            errorElement.textContent = 'Username is required';
            return false;
        }
        
        // Check minimum length
        if (value.length < 3) {
            errorElement.textContent = 'Username must be at least 3 characters';
            return false;
        }
        
        return true;
    }
    
    /**
     * Validate password field
     * @param {HTMLInputElement} input - Password input element
     * @param {HTMLElement} errorElement - Error message element
     * @returns {boolean} - Whether the password is valid
     */
    function validatePassword(input, errorElement) {
        const value = input.value;
        
        // Clear previous error
        errorElement.textContent = '';
        
        // Check if empty
        if (!value) {
            errorElement.textContent = 'Password is required';
            return false;
        }
        
        // Check minimum length
        if (value.length < 6) {
            errorElement.textContent = 'Password must be at least 6 characters';
            return false;
        }
        
        return true;
    }
}

/**
 * Initialize password toggle functionality
 */
function initPasswordToggle() {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.getElementById('toggle-password');
    const showPasswordIcon = document.querySelector('.show-password');
    const hidePasswordIcon = document.querySelector('.hide-password');
    
    if (!passwordInput || !toggleButton) return;
    
    toggleButton.addEventListener('click', () => {
        // Toggle password visibility
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            showPasswordIcon.style.display = 'none';
            hidePasswordIcon.style.display = 'block';
        } else {
            passwordInput.type = 'password';
            showPasswordIcon.style.display = 'block';
            hidePasswordIcon.style.display = 'none';
        }
        
        // Focus the input after toggling
        passwordInput.focus();
    });
}

/**
 * Handle form submission
 * In a real application, this would handle AJAX form submission
 * and authentication logic
 */
function handleFormSubmit() {
    const loginForm = document.getElementById('login-form');
    
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('remember').checked;
        
        // In a real application, you would send these credentials to a server
        // for authentication. For this demo, we'll simulate a successful login
        // and redirect to the specified URL.
        
        console.log('Login attempt:', { username, password, rememberMe });
        
        // Simulate API call delay
        setTimeout(() => {
            // Redirect to the dashboard page
            window.location.href = 'dashboard.html';
        }, 1000);
    });
}
