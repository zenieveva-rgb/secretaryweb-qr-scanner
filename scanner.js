import { auth, db, signOut, showToast } from './auth.js';
import { 
    ref, 
    set, 
    onValue,
    serverTimestamp,
    query,
    orderByChild,
    get
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// ==================== SCANNER STATE ====================
const state = {
    scanner: null,
    isScanning: false,
    currentCamera: 'environment',
    cameras: [],
    scanHistory: [],
    currentUser: null,
    flashEnabled: false
};

// ==================== DOM ELEMENTS ====================
const elements = {
    userName: document.getElementById('userName'),
    qrReader: document.getElementById('qr-reader'),
    toggleScan: document.getElementById('toggleScan'),
    toggleCamera: document.getElementById('toggleCamera'),
    flashToggle: document.getElementById('flashToggle'),
    scansList: document.getElementById('scansList'),
    scanCount: document.getElementById('scanCount'),
    resultModal: document.getElementById('resultModal'),
    scannedId: document.getElementById('scannedId'),
    scannedTime: document.getElementById('scannedTime'),
    closeModal: document.getElementById('closeModal'),
    scanAgain: document.getElementById('scanAgain'),
    historyBtn: document.getElementById('historyBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    historyModal: document.getElementById('historyModal'),
    closeHistory: document.getElementById('closeHistory'),
    historyList: document.getElementById('historyList'),
    historyDate: document.getElementById('historyDate'),
    refreshHistory: document.getElementById('refreshHistory')
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    initializeDateFilter();
});

// ==================== AUTH CHECK ====================
function checkAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        
        state.currentUser = user;
        
        // Get user data
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            const userData = snapshot.val();
            elements.userName.textContent = `${userData.firstName} ${userData.lastName}`;
            
            if (userData.status !== 'approved') {
                showToast('Account not approved', 'error');
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }
        }
        
        // Initialize scanner after auth
        initializeScanner();
        loadRecentScans();
    });
}

// ==================== QR SCANNER INITIALIZATION ====================
async function initializeScanner() {
    try {
        // Get available cameras
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
            state.cameras = devices;
            
            // Create scanner instance
            state.scanner = new Html5Qrcode("qr-reader");
            
            showToast('Scanner ready. Press Start to begin.', 'success');
        } else {
            showToast('No cameras found', 'error');
        }
    } catch (error) {
        console.error('Scanner init error:', error);
        showToast('Failed to initialize scanner', 'error');
    }
}

// ==================== SCANNER CONTROLS ====================
function setupEventListeners() {
    // Scan toggle
    elements.toggleScan?.addEventListener('click', toggleScanning);
    
    // Camera switch
    elements.toggleCamera?.addEventListener('click', switchCamera);
    
    // Flash toggle
    elements.flashToggle?.addEventListener('click', toggleFlash);
    
    // Modal controls
    elements.closeModal?.addEventListener('click', () => {
        elements.resultModal.classList.remove('active');
    });
    
    elements.scanAgain?.addEventListener('click', () => {
        elements.resultModal.classList.remove('active');
        if (!state.isScanning) {
            toggleScanning();
        }
    });
    
    // History
    elements.historyBtn?.addEventListener('click', openHistory);
    elements.closeHistory?.addEventListener('click', () => {
        elements.historyModal.classList.remove('active');
    });
    
    elements.refreshHistory?.addEventListener('click', loadHistory);
    
    elements.historyDate?.addEventListener('change', loadHistory);
    
    // Logout
    elements.logoutBtn?.addEventListener('click', handleLogout);
    
    // Close modals on outside click
    elements.resultModal?.addEventListener('click', (e) => {
        if (e.target === elements.resultModal) {
            elements.resultModal.classList.remove('active');
        }
    });
    
    elements.historyModal?.addEventListener('click', (e) => {
        if (e.target === elements.historyModal) {
            elements.historyModal.classList.remove('active');
        }
    });
}

async function toggleScanning() {
    if (!state.scanner) {
        showToast('Scanner not initialized', 'error');
        return;
    }
    
    if (state.isScanning) {
        // Stop scanning
        try {
            await state.scanner.stop();
            state.isScanning = false;
            updateScanButton();
            showToast('Scanner stopped', 'info');
        } catch (error) {
            console.error('Stop error:', error);
        }
    } else {
        // Start scanning
        try {
            const cameraId = state.cameras.length > 1 
                ? state.cameras.find(c => c.label.includes('back') || c.id.includes('1'))?.id || state.cameras[0].id
                : state.cameras[0].id;
            
            await state.scanner.start(
                cameraId,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1
                },
                onScanSuccess,
                onScanError
            );
            
            state.isScanning = true;
            state.currentCamera = cameraId;
            updateScanButton();
            showToast('Scanning started', 'success');
        } catch (error) {
            console.error('Start error:', error);
            showToast('Failed to start scanner', 'error');
        }
    }
}

function updateScanButton() {
    const btn = elements.toggleScan;
    if (state.isScanning) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-stop"></i><span>Stop</span>';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-solid fa-play"></i><span>Start</span>';
    }
}

async function switchCamera() {
    if (state.cameras.length < 2) {
        showToast('Only one camera available', 'warning');
        return;
    }
    
    const currentIndex = state.cameras.findIndex(c => c.id === state.currentCamera);
    const nextIndex = (currentIndex + 1) % state.cameras.length;
    const nextCamera = state.cameras[nextIndex];
    
    if (state.isScanning) {
        await state.scanner.stop();
        state.isScanning = false;
        updateScanButton();
    }
    
    state.currentCamera = nextCamera.id;
    showToast(`Switched to ${nextCamera.label || 'Camera ' + (nextIndex + 1)}`, 'success');
    
    // Auto-restart
    setTimeout(toggleScanning, 500);
}

function toggleFlash() {
    // Note: Flash control requires specific camera support
    state.flashEnabled = !state.flashEnabled;
    elements.flashToggle.classList.toggle('active', state.flashEnabled);
    showToast(`Flash ${state.flashEnabled ? 'enabled' : 'disabled'}`, 'info');
}

// ==================== SCAN HANDLERS ====================
async function onScanSuccess(decodedText, decodedResult) {
    // Prevent duplicate scans within 3 seconds
    const now = Date.now();
    const lastScan = state.scanHistory[0];
    if (lastScan && lastScan.data === decodedText && (now - lastScan.timestamp) < 3000) {
        return;
    }
    
    // Stop scanning temporarily
    if (state.isScanning) {
        await state.scanner.stop();
        state.isScanning = false;
        updateScanButton();
    }
    
    // Parse QR data (expecting JSON or plain text)
    let scanData = {
        raw: decodedText,
        studentId: null,
        studentName: null,
        timestamp: new Date().toISOString()
    };
    
    try {
        const parsed = JSON.parse(decodedText);
        scanData.studentId = parsed.id || parsed.studentId || null;
        scanData.studentName = parsed.name || parsed.studentName || null;
    } catch (e) {
        // If not JSON, use raw text as ID
        scanData.studentId = decodedText;
    }
    
    // Save to Firebase
    await saveScan(scanData);
    
    // Add to local history
    state.scanHistory.unshift({
        data: decodedText,
        timestamp: now,
        studentId: scanData.studentId,
        studentName: scanData.studentName
    });
    
    // Update UI
    addScanToList(scanData);
    showScanResult(scanData);
    
    // Play success sound (if browser allows)
    playBeep();
}

function onScanError(errorMessage) {
    // Silent - errors are normal during scanning
    console.log('Scan error:', errorMessage);
}

async function saveScan(scanData) {
    try {
        const scanId = Date.now().toString();
        const scanRef = ref(db, `scans/${scanId}`);
        
        await set(scanRef, {
            ...scanData,
            scannerId: state.currentUser?.uid || 'unknown',
            scannerEmail: state.currentUser?.email || 'unknown',
            scannedAt: serverTimestamp(),
            synced: true
        });
        
        // Also update attendance if student ID exists
        if (scanData.studentId) {
            const attendanceRef = ref(db, `attendance/${scanId}`);
            await set(attendanceRef, {
                studentId: scanData.studentId,
                studentName: scanData.studentName || 'Unknown',
                scannedBy: state.currentUser?.uid,
                scannerEmail: state.currentUser?.email,
                time: new Date().toISOString(),
                timestamp: serverTimestamp()
            });
        }
        
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save scan', 'error');
    }
}

// ==================== UI UPDATES ====================
function addScanToList(scanData) {
    const emptyState = elements.scansList.querySelector('.empty-scans');
    if (emptyState) {
        emptyState.remove();
    }
    
    const scanItem = document.createElement('div');
    scanItem.className = 'scan-item';
    scanItem.innerHTML = `
        <div class="scan-icon">
            <i class="fa-solid fa-check"></i>
        </div>
        <div class="scan-details">
            <div class="scan-id">${scanData.studentId || scanData.raw.substring(0, 20)}...</div>
            <div class="scan-time">${new Date().toLocaleTimeString()}</div>
        </div>
        <div class="scan-status">Recorded</div>
    `;
    
    elements.scansList.insertBefore(scanItem, elements.scansList.firstChild);
    
    // Update count
    const count = elements.scansList.querySelectorAll('.scan-item').length;
    elements.scanCount.textContent = count;
    
    // Keep only last 10
    while (elements.scansList.children.length > 10) {
        elements.scansList.removeChild(elements.scansList.lastChild);
    }
}

function showScanResult(scanData) {
    elements.scannedId.textContent = scanData.studentId || scanData.raw;
    elements.scannedTime.textContent = new Date().toLocaleString();
    elements.resultModal.classList.add('active');
}

function loadRecentScans() {
    // Load today's scans from Firebase
    const today = new Date().toISOString().split('T')[0];
    const scansRef = ref(db, 'scans');
    
    onValue(scansRef, (snapshot) => {
        const scans = [];
        snapshot.forEach((child) => {
            const scan = child.val();
            if (scan.scannerId === state.currentUser?.uid) {
                scans.push(scan);
            }
        });
        
        // Sort by time desc
        scans.sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
        
        // Update list
        elements.scansList.innerHTML = '';
        
        if (scans.length === 0) {
            elements.scansList.innerHTML = `
                <div class="empty-scans">
                    <i class="fa-solid fa-barcode"></i>
                    <p>No scans yet</p>
                    <span>Point camera at QR code</span>
                </div>
            `;
        } else {
            scans.slice(0, 10).forEach(scan => {
                addScanToList(scan);
            });
        }
        
        elements.scanCount.textContent = scans.length;
    });
}

// ==================== HISTORY ====================
function initializeDateFilter() {
    const today = new Date().toISOString().split('T')[0];
    elements.historyDate.value = today;
}

function openHistory() {
    elements.historyModal.classList.add('active');
    loadHistory();
}

async function loadHistory() {
    const selectedDate = elements.historyDate.value;
    const startOfDay = new Date(selectedDate).setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate).setHours(23, 59, 59, 999);
    
    elements.historyList.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        const scansRef = ref(db, 'scans');
        const snapshot = await get(scansRef);
        
        const scans = [];
        snapshot.forEach((child) => {
            const scan = child.val();
            const scanTime = new Date(scan.timestamp || scan.scannedAt).getTime();
            
            if (scan.scannerId === state.currentUser?.uid && 
                scanTime >= startOfDay && 
                scanTime <= endOfDay) {
                scans.push({ id: child.key, ...scan });
            }
        });
        
        scans.sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
        
        renderHistory(scans);
    } catch (error) {
        console.error('History error:', error);
        elements.historyList.innerHTML = '<div class="error">Failed to load history</div>';
    }
}

function renderHistory(scans) {
    if (scans.length === 0) {
        elements.historyList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <p>No scans for this date</p>
            </div>
        `;
        return;
    }
    
    elements.historyList.innerHTML = scans.map(scan => `
        <div class="history-item">
            <div class="history-icon">
                <i class="fa-solid fa-qrcode"></i>
            </div>
            <div class="history-details">
                <div class="history-id">${scan.studentId || scan.raw?.substring(0, 30) || 'Unknown'}</div>
                <div class="history-time">${new Date(scan.timestamp || scan.scannedAt).toLocaleTimeString()}</div>
            </div>
            <div class="history-status success">
                <i class="fa-solid fa-check"></i>
            </div>
        </div>
    `).join('');
}

// ==================== LOGOUT ====================
async function handleLogout() {
    try {
        // Stop scanner if running
        if (state.isScanning && state.scanner) {
            await state.scanner.stop();
        }
        
        await signOut(auth);
        localStorage.removeItem('secretaryweb_session');
        window.location.href = 'index.html';
    } catch (error) {
        showToast('Logout failed', 'error');
    }
}

// ==================== SOUND EFFECT ====================
function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        // Silent fail - audio not critical
    }
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', async () => {
    if (state.isScanning && state.scanner) {
        try {
            await state.scanner.stop();
        } catch (e) {
            // Ignore
        }
    }
});
