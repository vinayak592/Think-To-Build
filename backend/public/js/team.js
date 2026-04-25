let currentTeam = null;
let antiCheatIntervalId = null;
let devToolsSignalCount = 0;
let tabHiddenAt = null;
const socket = io();

// Real-time synchronization
socket.on('event_started', () => {
  eventStarted = true;
  updateReferenceVisibility();
  if (currentTeam && !currentTeam.disqualified && currentTeam.submissions.length < 3) {
    unlockInterface();
  }
});

socket.on('event_stopped', () => {
  eventStarted = false;
  updateReferenceVisibility();
  if (currentTeam && !currentTeam.disqualified && currentTeam.submissions.length < 3) {
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
const attemptCounter = document.getElementById('attempt-counter');
const bestScoreEl = document.getElementById('best-score');
const promptInput = document.getElementById('prompt-input');
const generateBtn = document.getElementById('generate-btn');
const dqBanner = document.getElementById('dq-banner');
const submissionsGrid = document.getElementById('submissions-grid');
const loadingOverlay = document.getElementById('loading');
const referenceImage = document.getElementById('reference-image');
const referenceLockNotice = document.getElementById('reference-lock-notice');

let eventStarted = false;

function updateReferenceVisibility() {
  if (!referenceImage || !referenceLockNotice) return;

  if (eventStarted) {
    referenceImage.style.display = 'block';
    referenceLockNotice.style.display = 'none';
  } else {
    referenceImage.style.display = 'none';
    referenceLockNotice.style.display = 'flex';
  }
}

// Add registration link to login page dynamically since we reuse the main index.html
document.addEventListener('DOMContentLoaded', () => {
  const loginCard = document.getElementById('login-screen');
  if (loginCard) {
    const regLink = document.createElement('p');
    regLink.innerHTML = `New Team? <a href="/register" style="color: var(--primary);">Register Here</a>`;
    regLink.style.marginTop = '20px';
    regLink.style.fontSize = '0.9rem';
    loginCard.appendChild(regLink);
  }

  // Auto-login if token exists (e.g. after registration redirect)
  const savedToken = localStorage.getItem('techfusion_token');
  const savedTeamId = localStorage.getItem('techfusion_team_id');
  if (savedToken && savedTeamId) {
    teamIdInput.value = savedTeamId;
    login(true);
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
  const teamId = teamIdInput.value.trim().toUpperCase(); // Ensure uppercase
  if (!teamId && !isSilent) return alert('Enter a Team ID');

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
    } else {
      if (!isSilent) alert(data.error || 'Login failed');
      else clearSession();
    }
  } catch (err) {
    console.error(err);
    if (!isSilent) alert('Network error during login');
  }
}

function updateUI() {
  if (!currentTeam) return;

  attemptCounter.textContent = `${currentTeam.submissions.length} / 3`;
  bestScoreEl.textContent = currentTeam.best_score.toFixed(2);

  // Always sync event status so reference image visibility is accurate.
  checkEventStatus();

  if (currentTeam.disqualified) {
    lockInterface('DISQUALIFIED');
    return;
  }

  if (currentTeam.submissions.length >= 3) {
    lockInterface('MAX_ATTEMPTS');
    renderSubmissions();
    return;
  }

  renderSubmissions();
}

async function checkEventStatus() {
  try {
    const res = await fetch('/api/event/status');
    const data = await res.json();
    eventStarted = data.event_started;
    updateReferenceVisibility();

    if (!eventStarted) {
      lockInterface('EVENT_NOT_STARTED');
    } else {
      unlockInterface();
    }
  } catch (err) {
    console.error('Failed to check event status');
  }
}

async function syncCurrentTeamState() {
  if (!currentTeam) return;

  const token = localStorage.getItem('techfusion_token');
  if (!token) {
    clearSession();
    return;
  }

  try {
    const res = await fetch('/api/team/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      clearSession();
      return;
    }

    if (!res.ok) return;

    const data = await res.json();
    if (!data.success || !data.team) return;

    currentTeam = data.team;
    updateUI();
  } catch (err) {
    console.error('Failed to sync team state');
  }
}

function unlockInterface() {
  if (!currentTeam || currentTeam.disqualified || currentTeam.submissions.length >= 3) return;
  promptInput.disabled = false;
  generateBtn.disabled = false;
  promptInput.placeholder = 'Describe the image in detail...';
  dqBanner.style.display = 'none';
  updateReferenceVisibility();

  // Remove waiting banner if exists
  const waitBanner = document.getElementById('event-wait-banner');
  if (waitBanner) waitBanner.remove();
}

function renderSubmissions() {
  submissionsGrid.innerHTML = '';
  currentTeam.submissions.forEach((sub, index) => {
    const card = document.createElement('div');
    card.className = 'sub-card';
    card.innerHTML = `
      <p style="font-size: 0.8rem; margin-bottom: 8px;">Attempt ${index + 1}</p>
      <img src="${sub.image_path}" alt="Attempt ${index + 1}">
      <div class="sub-details">
        <p>CLIP Score: <strong>${sub.clip_score.toFixed(2)}</strong></p>
        <p>Gemini Score: <strong>${sub.gemini_score.toFixed(2)}</strong></p>
        <p style="font-weight: bold; color: #60a5fa; margin-top: 4px;">Final Score: ${sub.final_score.toFixed(2)}</p>
      </div>
    `;
    submissionsGrid.appendChild(card);
  });
}

function lockInterface(reason) {
  promptInput.disabled = true;
  generateBtn.disabled = true;
  updateReferenceVisibility();
  
  if (reason === 'DISQUALIFIED') {
    dqBanner.style.display = 'block';
    promptInput.placeholder = "Team Disqualified. Input locked.";
  } else if (reason === 'MAX_ATTEMPTS') {
    promptInput.placeholder = "Max attempts reached.";
  } else if (reason === 'EVENT_NOT_STARTED') {
    promptInput.placeholder = "Waiting for admin to start the event...";
    // Show a waiting banner
    if (!document.getElementById('event-wait-banner')) {
      const banner = document.createElement('div');
      banner.id = 'event-wait-banner';
      banner.style.cssText = 'background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; padding: 16px; border-radius: 8px; text-align: center; font-weight: 600; margin-bottom: 20px; animation: pulse 2s infinite;';
      banner.innerHTML = '[Pending] Event has not started yet. Please wait for the admin to begin the competition.';
      const mainLayout = document.getElementById('main-layout');
      if (mainLayout) mainLayout.parentNode.insertBefore(banner, mainLayout);
    }
  }
}

async function submitPrompt() {
  if (!currentTeam || currentTeam.disqualified || currentTeam.submissions.length >= 3) return;
  
  const prompt = promptInput.value.trim();
  if (!prompt) return alert('Enter a prompt');

  const token = localStorage.getItem('techfusion_token');
  if (!token) return clearSession();

  loadingOverlay.style.display = 'flex';
  generateBtn.disabled = true;

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt }) // team_id is no longer needed in body
    });
    
    const data = await res.json();
    
    // Handle unauthorized
    if (res.status === 401 || res.status === 403) {
      if (data.error && data.error.includes('token')) {
        alert('Session expired. Please log in again.');
        return clearSession();
      }
    }

    if (data.error) {
      alert(data.error);
      if (data.error.includes('disqualified')) {
        currentTeam.disqualified = true;
        updateUI();
      }
    } else if (data.success) {
      currentTeam.submissions.push(data.submission);
      currentTeam.best_score = data.best_score;
      promptInput.value = '';
      updateUI();
    }
  } catch (err) {
    console.error(err);
    alert('Submission failed. Check backend logs.');
  } finally {
    loadingOverlay.style.display = 'none';
    if (!currentTeam.disqualified && currentTeam.submissions.length < 3) {
      generateBtn.disabled = false;
    }
  }
}

// Strictly detect tab switch or minimize
function setupTabSwitchDetection() {
  if (antiCheatIntervalId) return;

  const handleVisibilityChange = () => {
    if (document.hidden || document.visibilityState === 'hidden') {
      tabHiddenAt = Date.now();
      return;
    }

    if (tabHiddenAt && Date.now() - tabHiddenAt > 1500) {
      triggerDisqualification('Page hidden or tab switched');
    }
    tabHiddenAt = null;
  };

  const handleBlockedKeys = (event) => {
    const key = event.key.toLowerCase();
    const opensDevTools =
      key === 'f12' ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key));

    if (opensDevTools || key === 'printscreen') {
      event.preventDefault();
      triggerDisqualification(opensDevTools ? 'DevTools shortcut detected' : 'Screenshot key detected');
    }
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    triggerDisqualification('Right-click inspect attempt detected');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('keydown', handleBlockedKeys);
  document.addEventListener('contextmenu', handleContextMenu);

  antiCheatIntervalId = window.setInterval(() => {
    if (!currentTeam || currentTeam.disqualified) return;

    const widthGap = Math.abs(window.outerWidth - window.innerWidth);
    const heightGap = Math.abs(window.outerHeight - window.innerHeight);
    const devtoolsOpen = widthGap > 220 || heightGap > 220;

    if (devtoolsOpen) {
      devToolsSignalCount += 1;
      if (devToolsSignalCount >= 3) {
        triggerDisqualification('DevTools panel detected');
      }
      return;
    }
    devToolsSignalCount = 0;
  }, 1000);
}

async function triggerDisqualification(reason = 'Anti-cheat rule triggered') {
  if (currentTeam && !currentTeam.disqualified) {
    console.warn(`Disqualifying ${currentTeam.team_id}: ${reason}`);
    currentTeam.disqualified = true;
    updateUI(); // Immediate UI lock
    
    const token = localStorage.getItem('techfusion_token');
    if (!token) return;

    // Notify server securely
    try {
      await fetch('/api/disqualify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error('Failed to sync disqualification with server');
    }
  }
}

