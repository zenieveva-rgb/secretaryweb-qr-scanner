import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    onValue,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-database.js";

// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
    apiKey: "AIzaSyBdlEvDlQ1qWr8xdL4bV25NW4RgcTajYqM",
    authDomain: "database-98a70.firebaseapp.com",
    databaseURL: "https://database-98a70-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "database-98a70",
    storageBucket: "database-98a70.firebasestorage.app",
    messagingSenderId: "460345885965",
    appId: "1:460345885965:web:8484da766b979a0eaf9c44"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ==================== STATE MANAGEMENT ====================
const state = {
    currentUser: null,
    isApproved: false,
    isLoading: false
};

// ==================== DOM ELEMENTS ====================
const elements = {
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm'),
    pendingState: document.getElementById('pendingState'),
    loginFormElement: document.getElementById('loginFormElement'),
    signupFormElement: document.getElementById('signupFormElement'),
    showSignup: document.getElementById('showSignup'),
    showLogin: document.getElementById('showLogin'),
    backToLogin: document.getElementById('backToLogin'),
    loginBtn: document.getElementById('loginBtn'),
    signupBtn: document.getElementById('signupBtn'),
    toggleLoginPass: document.getElementById('toggleLoginPass'),
    toggleSignupPass: document.getElementById('toggleSignupPass'),
    passwordStrength: document.getElementById('passwordStrength'),
    pendingEmail: document.getElementById('pendingEmail'),
    toastContainer: document.getElementById('toastContainer')
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    setupEventListeners();
    checkAuthState();
});

// ==================== PARTICLES ANIMATION ====================
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        container.appendChild(particle);
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Form switching
    elements.showSignup?.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('signup');
    });
    
    elements.showLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('login');
    });
    
    elements.backToLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('login');
    });
    
    // Password toggles
    elements.toggleLoginPass?.addEventListener('click', () => {
        togglePassword('loginPassword', elements.toggleLoginPass);
    });
    
    elements.toggleSignupPass?.addEventListener('click', () => {
        togglePassword('signupPassword', elements.toggleSignupPass);
    });
    
    // Form submissions
    elements.loginFormElement?.addEventListener('submit', handleLogin);
    elements.signupFormElement?.addEventListener('submit', handleSignup);
    
    // Password strength
    document.getElementById('signupPassword')?.addEventListener('input', checkPasswordStrength);
    
    // Forgot password
    document.getElementById('forgotPassword')?.addEventListener('click', handleForgotPassword);
}

// ==================== FORM SWITCHING ====================
function switchForm(formName) {
    elements.loginForm?.classList.remove('active');
    elements.signupForm?.classList.remove('active');
    elements.pendingState?.classList.remove('active');
    
    if (formName === 'login') {
        elements.loginForm?.classList.add('active');
    } else if (formName === 'signup') {
        elements.signupForm?.classList.add('active');
    } else if (formName === 'pending') {
        elements.pendingState?.classList.add('active');
    }
}

// ==================== PASSWORD TOGGLE ====================
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    const icon = btn.querySelector('i');
    icon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
}

// ==================== PASSWORD STRENGTH ====================
function checkPasswordStrength(e) {
    const password = e.target.value;
    const bars = elements.passwordStrength?.querySelectorAll('.strength-bars span');
    const text = elements.passwordStrength?.querySelector('.strength-text');
    
    if (!bars) return;
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\\d/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    bars.forEach((bar, index) => {
        bar.className = '';
        if (index < strength) {
            if (strength === 1) bar.classList.add('weak');
            else if (strength === 2) bar.classList.add('fair');
            else if (strength === 3) bar.classList.add('good');
            else if (strength === 4) bar.classList.add('strong');
        }
    });
    
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    if (text) text.textContent = labels[strength] || 'Password strength';
}

// ==================== LOGIN HANDLER ====================
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    setLoading(elements.loginBtn, true);
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Check if user is approved
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
            throw new Error('User data not found');
        }
        
        const userData = snapshot.val();
        
        if (userData.status === 'pending') {
            await signOut(auth);
            showToast('Your account is pending admin approval', 'warning');
            switchForm('pending');
            elements.pendingEmail.textContent = email;
            return;
        }
        
        if (userData.status === 'blocked') {
            await signOut(auth);
            throw new Error('Your account has been blocked. Contact admin.');
        }
        
        if (userData.status !== 'approved') {
            await signOut(auth);
            throw new Error('Account not approved');
        }
        
        // Update last login
        await set(ref(db, `users/${user.uid}/lastLogin`), serverTimestamp());
        
        showToast('Login successful! Redirecting...', 'success');
        
        // Store session if remember me
        if (rememberMe) {
            localStorage.setItem('secretaryweb_session', user.uid);
        }
        
        // Redirect to scanner
        setTimeout(() => {
            window.location.href = 'scanner.html';
        }, 1500);
        
    } catch (error) {
        console.error('Login error:', error);
        let message = 'Login failed';
        
        switch(error.code) {
            case 'auth/user-not-found':
                message = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address';
                break;
            case 'auth/user-disabled':
                message = 'Account has been disabled';
                break;
            default:
                message = error.message || 'Login failed. Please try again.';
        }
        
        showToast(message, 'error');
    } finally {
        setLoading(elements.loginBtn, false);
    }
}

// ==================== SIGNUP HANDLER ====================
async function handleSignup(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('signupFirstName').value;
    const lastName = document.getElementById('signupLastName').value;
    const email = document.getElementById('signupEmail').value;
    const department = document.getElementById('signupDepartment').value;
    const employeeId = document.getElementById('signupEmployeeId').value;
    const password = document.getElementById('signupPassword').value;
    
    setLoading(elements.signupBtn, true);
    
    try {
        // Create auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create user profile with pending status
        const userData = {
            uid: user.uid,
            firstName,
            lastName,
            email,
            department,
            employeeId,
            status: 'pending',
            role: 'scanner',
            createdAt: serverTimestamp(),
            lastLogin: null,
            approvedBy: null,
            approvedAt: null
        };
        
        await set(ref(db, `users/${user.uid}`), userData);
        
        // Create pending approval request
        await set(ref(db, `pendingApprovals/${user.uid}`), {
            ...userData,
            requestedAt: serverTimestamp()
        });
        
        // Log the signup for admin notification
        await set(ref(db, `adminNotifications/${user.uid}`), {
            type: 'new_user_request',
            message: `New user ${firstName} ${lastName} (${email}) requests access`,
            timestamp: serverTimestamp(),
            read: false
        });
        
        // Sign out immediately - require approval
        await signOut(auth);
        
        showToast('Request submitted successfully!', 'success');
        elements.pendingEmail.textContent = email;
        switchForm('pending');
        
    } catch (error) {
        console.error('Signup error:', error);
        let message = 'Signup failed';
        
        switch(error.code) {
            case 'auth/email-already-in-use':
                message = 'An account with this email already exists';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address';
                break;
            case 'auth/weak-password':
                message = 'Password is too weak';
                break;
            default:
                message = error.message || 'Signup failed. Please try again.';
        }
        
        showToast(message, 'error');
    } finally {
        setLoading(elements.signupBtn, false);
    }
}

// ==================== FORGOT PASSWORD ====================
async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    
    if (!email) {
        showToast('Please enter your email address', 'warning');
        return;
    }
    
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Password reset email sent!', 'success');
    } catch (error) {
        showToast('Failed to send reset email', 'error');
    }
}

// ==================== AUTH STATE CHECK ====================
function checkAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if already approved
            const userRef = ref(db, `users/${user.uid}`);
            const snapshot = await get(userRef);
            
            if (snapshot.exists() && snapshot.val().status === 'approved') {
                // Auto-redirect to scanner if on login page
                if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                    window.location.href = 'scanner.html';
                }
            }
        }
    });
    
    // Check local storage session
    const session = localStorage.getItem('secretaryweb_session');
    if (session && (window.location.pathname.includes('index.html') || window.location.pathname === '/')) {
        // Verify session is still valid
        const userRef = ref(db, `users/${session}`);
        get(userRef).then(snapshot => {
            if (snapshot.exists() && snapshot.val().status === 'approved') {
                window.location.href = 'scanner.html';
            } else {
                localStorage.removeItem('secretaryweb_session');
            }
        });
    }
}

// ==================== UTILITY FUNCTIONS ====================
function setLoading(btn, isLoading) {
    if (!btn) return;
    btn.classList.toggle('loading', isLoading);
    btn.disabled = isLoading;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-triangle-exclamation',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fa-solid ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

