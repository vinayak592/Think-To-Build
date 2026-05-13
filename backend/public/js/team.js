let currentTeam = null;
let antiCheatIntervalId = null;
let devToolsSignalCount = 0;
let tabHiddenAt = null;
let selectedFiles = []; // Files selected for upload
let fileDialogActive = false; // Prevent false disqualification during file chooser
const socket = io();

// Real-time synchronization
socket.on('event_started', () => {
  eventStarted = true;
  if (currentTeam && !currentTeam.disqualified && currentTeam.upload_attempts_used < currentTeam.max_upload_attempts) {
    unlockInterface();
  }
});

socket.on('event_stopped', () => {
  eventStarted = false;
  if (currentTeam && !currentTeam.disqualified && currentTeam.upload_attempts_used < currentTeam.max_upload_attempts) {
    lockInterface('EVENT_NOT_STARTED');
  }
});

socket.on('leaderboard_update', () => {
  syncCurrentTeamState();
});

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboardContainer = document.getElementById('dashboard-container');
const loginContainer = document.getElementById('login-container');
const teamIdInput = document.getElementById('team-id-input');
const displayTeamId = document.getElementById('display-team-id');
const imageCounter = document.getElementById('image-counter');
const uploadBtn = document.getElementById('upload-btn');
const clearBtn = document.getElementById('clear-btn');
const optOutBtn = document.getElementById('opt-out-btn');
const dqBanner = document.getElementById('dq-banner');
const optoutBanner = document.getElementById('optout-banner');
const loadingOverlay = document.getElementById('loading');
const uploadZone = document.getElementById('upload-zone');
const selectBtn = document.getElementById('select-btn');
const fileInput = document.getElementById('file-input');
const previewGrid = document.getElementById('preview-grid');
const attemptsCounter = document.getElementById('attempts-counter');

let eventStarted = false;

// ===== UPLOAD ZONE SETUP =====

selectBtn.addEventListener('click', () => {
  if (uploadBtn.disabled && currentTeam && currentTeam.upload_attempts_used >= currentTeam.max_upload_attempts) return;
  fileInput.value = '';
  fileDialogActive = true;
  fileInput.click();
});

uploadZone.addEventListener('click', () => {
  selectBtn.click();
});

fileInput.addEventListener('change', (e) => {
  handleFileSelection(e.target.files);
  fileDialogActive = false;
});

window.addEventListener('focus', () => {
  fileDialogActive = false;
});

// Directory selection - no drag & drop needed

function isImageFile(file) {
  const rawName = file.name || file.webkitRelativePath || file.path || '';
  const name = rawName.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  const imageMime = file.type;
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const allowedMime = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif'];
  return allowedMime.includes(imageMime) || allowedExt.includes(extension);
}

function handleFileSelection(fileList) {
  const existingCount = currentTeam ? (currentTeam.round1_images || []).length : 0;
  const maxNew = 3 - existingCount;

  if (maxNew <= 0) {
    alert('You have already uploaded 3 images.');
    return;
  }

  // Filter for image files only
  const allFiles = Array.from(fileList);
  const imageFiles = allFiles.filter(isImageFile);

  const uploadText = document.querySelector('.upload-text');
  if (uploadText) {
    uploadText.innerHTML = `<strong style="color:#60a5fa">${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} selected</strong>`;
  }

  if (imageFiles.length === 0) {
    alert('No image files found. Please select JPG, PNG, WebP, or GIF images.');
    return;
  }

  // Take first available images up to the limit
  selectedFiles = imageFiles.slice(0, maxNew);
  
  // Update UI feedback
  if (uploadText) {
    if (imageFiles.length > maxNew) {
      uploadText.innerHTML = `<strong style="color:#60a5fa">Images selected</strong> • ${imageFiles.length} found, using first ${maxNew}`;
    } else {
      uploadText.innerHTML = `<strong style="color:#60a5fa">Images selected</strong> • ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}`;
    }
  }
  
  renderPreviews();
  updateButtonStates();
}

function clearSelection() {
  selectedFiles = [];
  renderPreviews();
  updateButtonStates();
  
  // Reset upload text
  const uploadText = document.querySelector('.upload-text');
  uploadText.innerHTML = `<strong style="color:#60a5fa">Select up to 3 images</strong> to upload`;
  
  // Clear file input
  fileInput.value = '';
}

function updateButtonStates() {
  uploadBtn.disabled = selectedFiles.length === 0;
  clearBtn.disabled = selectedFiles.length === 0;
  uploadZone.classList.toggle('has-files', selectedFiles.length > 0);
}

async function optOutOfUploads() {
  if (!confirm('Are you sure you want to opt out of image uploads? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch('/api/opt-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('techfusion_token')}`
      }
    });

    const data = await res.json();
    if (data.success) {
      currentTeam = data.team;
      updateUI();
      alert('You have successfully opted out of image uploads.');
    } else {
      alert(data.error || 'Opt-out failed');
    }
  } catch (err) {
    console.error('Opt-out error:', err);
    alert('Network error during opt-out');
  }
}

function renderPreviews() {
  previewGrid.innerHTML = '';
  if (selectedFiles.length === 0) {
    previewGrid.style.display = 'none';
    return;
  }
  previewGrid.style.display = 'grid';

  selectedFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name || file.webkitRelativePath || `Preview ${i + 1}`;

    const label = document.createElement('div');
    label.className = 'preview-label';
    label.textContent = file.name || file.webkitRelativePath || `File ${i + 1}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'preview-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      selectedFiles.splice(i, 1);
      renderPreviews();
      updateButtonStates();
      
      // Update upload text if no files left
      if (selectedFiles.length === 0) {
        const uploadText = document.querySelector('.upload-text');
        uploadText.innerHTML = `<strong style="color:#60a5fa">Select up to 3 images</strong> to upload`;
      }
    };
    item.appendChild(img);
    item.appendChild(label);
    item.appendChild(removeBtn);
    previewGrid.appendChild(item);
  });
}

// Reference visibility removed

// ===== LOGIN =====

document.addEventListener('DOMContentLoaded', () => {
  const loginCard = document.getElementById('login-screen');
  if (loginCard) {
    const regLink = document.createElement('p');
    regLink.innerHTML = `New Team? <a href="/register" style="color: var(--primary);">Register Here</a>`;
    regLink.style.marginTop = '20px';
    regLink.style.fontSize = '0.9rem';
    loginCard.appendChild(regLink);

    const switchLink = document.createElement('p');
    switchLink.innerHTML = `Switch Team? <a href="#" onclick="clearSession(); return false;" style="color: var(--cyan-400);">Clear Session</a>`;
    switchLink.style.marginTop = '10px';
    switchLink.style.fontSize = '0.8rem';
    switchLink.style.color = '#8892b0';
    loginCard.appendChild(switchLink);
  }

  const savedTeamId = localStorage.getItem('techfusion_team_id');
  if (savedTeamId && !teamIdInput.value.trim()) {
    teamIdInput.value = savedTeamId;
  }
});

function clearSession() {
  localStorage.removeItem('techfusion_token');
  localStorage.removeItem('techfusion_team_id');
  currentTeam = null;
  loginContainer.style.display = 'flex';
  dashboardContainer.style.display = 'none';
}

async function login(isSilent = false) {
  const teamId = teamIdInput.value.trim().toUpperCase();
  if (!teamId && !isSilent) return alert('Enter a Team ID');

  currentTeam = null;
  if (!isSilent) {
    dqBanner.style.display = 'none';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId })
    });
    const data = await res.json();

    if (data.success) {
      currentTeam = data.team;
      localStorage.setItem('techfusion_token', data.token);
      localStorage.setItem('techfusion_team_id', data.team.team_id);

      loginContainer.style.display = 'none';
      dashboardContainer.style.display = 'block';
      displayTeamId.textContent = currentTeam.team_id;

      updateUI();
      setupTabSwitchDetection();
      
      // Sync fresh team data to get latest scores
      setTimeout(() => syncCurrentTeamState(), 300);
    } else {
      if (!isSilent) alert(data.error || 'Login failed');
      else clearSession();
    }
  } catch (err) {
    console.error(err);
    if (!isSilent) alert('Network error during login');
    loginContainer.style.display = 'flex';
    dashboardContainer.style.display = 'none';
  }
}

// ===== UI UPDATE =====

function updateUI() {
  if (!currentTeam) return;
  const images = currentTeam.round1_images || [];
  if (imageCounter) imageCounter.textContent = `${images.length} / 3`;
  
  // Update upload attempts counter
  if (attemptsCounter) {
    const used = currentTeam.upload_attempts_used || 0;
    const max = currentTeam.max_upload_attempts || 3;
    attemptsCounter.textContent = `${used} / ${max}`;
  }

  // Update Round 1 Score display - show if images exist
  const scoreDisplay = document.getElementById('score-display');
  const round1ScoreElem = document.getElementById('round1-score');
  if (images.length > 0 && scoreDisplay && round1ScoreElem) {
    scoreDisplay.style.display = 'flex';
    const score = Number(currentTeam.round1_score) || 0;
    round1ScoreElem.textContent = score.toFixed(2);
  }

  checkEventStatus();

  // Handle opt-out state
  if (currentTeam.opted_out) {
    optoutBanner.style.display = 'block';
    lockInterface('OPTED_OUT');
    return;
  } else {
    optoutBanner.style.display = 'none';
  }

  if (currentTeam.disqualified) {
    lockInterface('DISQUALIFIED');
    return;
  }

  // Check upload attempts limit
  const usedAttempts = currentTeam.upload_attempts_used || 0;
  const maxAttempts = currentTeam.max_upload_attempts || 3;
  if (usedAttempts >= maxAttempts) {
    lockInterface('MAX_ATTEMPTS');
    return;
  }

  if (images.length >= 3) {
    lockInterface('MAX_UPLOADS');
    return;
  }
}

async function checkEventStatus() {
  try {
    const res = await fetch('/api/event/status');
    const data = await res.json();
    eventStarted = data.event_started;
    if (!eventStarted) {
      lockInterface('EVENT_NOT_STARTED');
    } else if (currentTeam && !currentTeam.disqualified && currentTeam.upload_attempts_used < currentTeam.max_upload_attempts) {
      unlockInterface();
    }
  } catch (err) {
    console.error('Failed to check event status');
  }
}

async function syncCurrentTeamState() {
  if (!currentTeam) return;
  const token = localStorage.getItem('techfusion_token');
  if (!token) { clearSession(); return; }
  try {
    const res = await fetch('/api/team/me', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) { clearSession(); return; }
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.team) return;
    currentTeam = data.team;
    console.log('Team state synced:', { round1_score: currentTeam.round1_score, images: currentTeam.round1_images.length });
    updateUI();
  } catch (err) {
    console.error('Failed to sync team state');
  }
}

function unlockInterface() {
  if (!currentTeam || currentTeam.disqualified || currentTeam.upload_attempts_used >= currentTeam.max_upload_attempts) return;
  uploadBtn.disabled = selectedFiles.length === 0;
  uploadZone.style.pointerEvents = 'auto';
  uploadZone.style.opacity = '1';
  dqBanner.style.display = 'none';

  const waitBanner = document.getElementById('event-wait-banner');
  if (waitBanner) waitBanner.remove();
}

function renderSubmissions() {
  // Logic removed to hide images from participants
}

function lockInterface(reason) {
  uploadBtn.disabled = true;
  uploadZone.style.pointerEvents = 'none';
  uploadZone.style.opacity = '0.5';

  if (reason === 'DISQUALIFIED') {
    dqBanner.style.display = 'block';
  } else if (reason === 'MAX_UPLOADS') {
    // Show completion notice
    if (!document.getElementById('max-uploads-help')) {
      const helpDiv = document.createElement('div');
      helpDiv.id = 'max-uploads-help';
      helpDiv.style.cssText = 'background: rgba(52, 211, 153, 0.1); border: 1px solid rgba(52, 211, 153, 0.3); color: #6ee7b7; padding: 16px; border-radius: 8px; text-align: center; font-size: 0.9rem; margin-top: 16px;';
      helpDiv.innerHTML = '<strong>✅ All 3 images uploaded!</strong><br>Your Round 1 score has been calculated.';
      const actionPanel = document.querySelector('.upload-card');
      if (actionPanel) actionPanel.appendChild(helpDiv);
    }
  } else if (reason === 'OPTED_OUT') {
    uploadZone.style.display = 'none';
    optOutBtn.style.display = 'none';
    if (!document.getElementById('optout-help')) {
      const helpDiv = document.createElement('div');
      helpDiv.id = 'optout-help';
      helpDiv.style.cssText = 'background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: #fbbf24; padding: 16px; border-radius: 8px; text-align: center; font-size: 0.9rem; margin-top: 16px;';
      helpDiv.innerHTML = '<strong>⚠️ Opted Out</strong><br>This team has opted out of image uploads.';
      const actionPanel = document.querySelector('.upload-card');
      if (actionPanel) actionPanel.appendChild(helpDiv);
    }
  } else if (reason === 'MAX_ATTEMPTS') {
    uploadZone.style.display = 'none';
    optOutBtn.style.display = 'none';
    if (!document.getElementById('max-attempts-help')) {
      const helpDiv = document.createElement('div');
      helpDiv.id = 'max-attempts-help';
      helpDiv.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 16px; border-radius: 8px; text-align: center; font-size: 0.9rem; margin-top: 16px;';
      helpDiv.innerHTML = '<strong>🚫 Upload Attempts Exhausted</strong><br>You have used all 3 upload attempts.';
      const actionPanel = document.querySelector('.upload-card');
      if (actionPanel) actionPanel.appendChild(helpDiv);
    }
  } else if (reason === 'EVENT_NOT_STARTED') {
    if (!document.getElementById('event-wait-banner')) {
      const banner = document.createElement('div');
      banner.id = 'event-wait-banner';
      banner.style.cssText = 'background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; padding: 16px; border-radius: 8px; text-align: center; font-weight: 600; margin-bottom: 20px; animation: pulse 2s infinite;';
      banner.innerHTML = '[Pending] Event has not started yet. Please wait for admin to begin.';
      const mainLayout = document.getElementById('main-layout');
      if (mainLayout) mainLayout.parentNode.insertBefore(banner, mainLayout);
    }
  }
}

// ===== UPLOAD IMAGES =====

async function uploadImages() {
  if (!currentTeam || currentTeam.disqualified || currentTeam.upload_attempts_used >= currentTeam.max_upload_attempts) return;
  if (selectedFiles.length === 0) return alert('Please select at least one image');

  const token = localStorage.getItem('techfusion_token');
  if (!token) return clearSession();

  loadingOverlay.style.display = 'flex';
  uploadBtn.disabled = true;

  try {
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('images', file));

    const res = await fetch('/api/upload-images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      alert('Session expired. Please log in again.');
      return clearSession();
    }

    if (data.error) {
      alert(data.error);
    } else if (data.success) {
      // Update local state
      if (!currentTeam.round1_images) currentTeam.round1_images = [];
      data.images.forEach(img => currentTeam.round1_images.push(img));
      currentTeam.round1_score = Number(data.round1_score) || currentTeam.round1_score || 0;
      currentTeam.upload_attempts_used = (currentTeam.upload_attempts_used || 0) + 1;
      selectedFiles = [];
      renderPreviews();
      fileInput.value = '';
      uploadZone.classList.remove('has-files');
      updateUI();
      
      // Sync again to ensure server data is fresh
      setTimeout(() => syncCurrentTeamState(), 500);
    }
  } catch (err) {
    console.error(err);
    alert('Upload failed. Check your connection.');
  } finally {
    loadingOverlay.style.display = 'none';
    if (currentTeam && !currentTeam.disqualified && currentTeam.upload_attempts_used < currentTeam.max_upload_attempts) {
      uploadBtn.disabled = selectedFiles.length === 0;
    }
  }
}

// ===== STRICT ANTI-CHEAT (ROUND 1) =====

function setupTabSwitchDetection() {
  if (antiCheatIntervalId) return;

  // 1. Tab Switching / Page Hiding (Instant Disqualification)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !fileDialogActive) {
      triggerDisqualification('Switched tabs or minimized browser');
    }
  });

  // 2. Loss of Window Focus (Clicking outside browser, notifications, etc.)
  window.addEventListener('blur', () => {
    if (!fileDialogActive) {
      triggerDisqualification('Window lost focus');
    }
  });

  // 3. Prevent Copy / Paste / Cut
  ['copy', 'cut', 'paste'].forEach(evt => {
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      triggerDisqualification(`Attempted to ${evt}`);
    });
  });

  // 4. Shortcut Keys
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const opensDevTools = key === 'f12' || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key));
    if (opensDevTools || key === 'printscreen' || (event.ctrlKey && key === 'c') || (event.ctrlKey && key === 'v')) {
      event.preventDefault();
      triggerDisqualification('Prohibited keyboard shortcut');
    }
  });

  // 5. Right Click
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    triggerDisqualification('Right-click detected');
  });

  // 6. DevTools Size Detection (Instant)
  antiCheatIntervalId = window.setInterval(() => {
    if (!currentTeam || currentTeam.disqualified) return;
    const widthGap = Math.abs(window.outerWidth - window.innerWidth);
    const heightGap = Math.abs(window.outerHeight - window.innerHeight);
    if (widthGap > 220 || heightGap > 220) {
      triggerDisqualification('DevTools panel detected');
    }
  }, 1000);
}

async function triggerDisqualification(reason = 'Anti-cheat rule triggered') {
  if (currentTeam && !currentTeam.disqualified) {
    console.warn(`Disqualifying ${currentTeam.team_id}: ${reason}`);
    currentTeam.disqualified = true;
    updateUI();

    const token = localStorage.getItem('techfusion_token');
    if (!token) return;
    try {
      await fetch('/api/disqualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Failed to sync disqualification');
    }
  }
}
