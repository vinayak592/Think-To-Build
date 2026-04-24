const socket = io();

// Real-time synchronization
socket.on('leaderboard_update', () => fetchLeaderboard());

const leaderboardBody = document.getElementById('leaderboard-body');
let teamsData = [];
let judgeToken = localStorage.getItem('techfusion_judge_token');

function clampRubricScore(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(50, num));
}

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

function getRubricBreakdown(team) {
  const baseFallback = clampRubricScore((Number(team.round2_score) || 0) / 2, 0);
  const breakdown = team.round2_breakdown || {};

  return {
    creativity: clampRubricScore(breakdown.creativity, baseFallback),
    accuracy: clampRubricScore(breakdown.accuracy, baseFallback)
  };
}

function calculateRound2ScoreFromRubric(breakdown) {
  return roundTo2(breakdown.creativity + breakdown.accuracy);
}

// Redirect to login if no token
if (!judgeToken) {
  window.location.href = '/judge';
}

// Fetch and render leaderboard
async function fetchLeaderboard() {
  console.log('Fetching leaderboard data...');
  const contentEl = document.getElementById('leaderboard-content');
  
  if (!judgeToken) {
    console.error('No judge token found in localStorage');
    window.location.href = '/judge';
    return;
  }

  try {
    const res = await fetch('/api/admin/teams', {
      headers: {
        'Authorization': `Bearer ${judgeToken}`
      }
    });

    console.log('Leaderboard fetch response status:', res.status);

    if (res.status === 401 || res.status === 403) {
      console.warn('Unauthorized access, logging out...');
      logout();
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }

    teamsData = await res.json();
    console.log(`Successfully fetched ${teamsData.length} teams.`);
    renderLeaderboard();
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    if (leaderboardBody) {
      leaderboardBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#ef4444; padding: 40px;">
        <div style="font-size: 1.2rem; margin-bottom: 8px;">⚠️ Connection Error</div>
        <div>${err.message}</div>
        <button class="btn-judge btn-export" style="margin: 20px auto;" onclick="fetchLeaderboard()">Retry Connection</button>
      </td></tr>`;
    }
  }
}

function renderLeaderboard() {
  leaderboardBody.innerHTML = '';
  
  // Filter out disqualified teams
  const qualifiedTeams = teamsData.filter(team => !team.disqualified);

  // Sort by final_total_score descending
  qualifiedTeams.sort((a, b) => {
    const aRound2 = calculateRound2ScoreFromRubric(getRubricBreakdown(a));
    const bRound2 = calculateRound2ScoreFromRubric(getRubricBreakdown(b));
    const aTotal = a.best_score + aRound2;
    const bTotal = b.best_score + bRound2;
    return bTotal - aTotal;
  });

  qualifiedTeams.forEach((team, index) => {
    const rubric = getRubricBreakdown(team);
    const round2Score = calculateRound2ScoreFromRubric(rubric);
    const totalScore = team.best_score + round2Score;

    const tr = document.createElement('tr');
    tr.className = `team-row ${team.disqualified ? 'disqualified' : ''}`;
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="team-id-cell">${team.team_id}</div>
        <div style="font-size:0.75rem; color:#8892b0;">${team.participant_name || 'No Participant Name'}</div>
        <div style="font-size:0.75rem; color:#8892b0;">(${team.team_name || 'No Team Name'})</div>
      </td>
      <td>${team.submissions.length} / 3</td>
      <td>${team.best_score.toFixed(2)}</td>
      <td>
        <input type="number" 
               class="score-input rubric-input"
               id="rubric-creativity-${team.team_id}"
               value="${rubric.creativity}" 
               min="0" max="50" step="0.1"
               onchange="updateRound2Rubric('${team.team_id}')"
               ${team.disqualified ? 'disabled' : ''}>
      </td>
      <td>
        <input type="number" 
               class="score-input rubric-input"
               id="rubric-accuracy-${team.team_id}"
               value="${rubric.accuracy}" 
               min="0" max="50" step="0.1"
               onchange="updateRound2Rubric('${team.team_id}')"
               ${team.disqualified ? 'disabled' : ''}>
      </td>
      <td><span class="final-score" id="round2-auto-${team.team_id}">${round2Score.toFixed(2)}</span></td>
      <td><span class="final-score" id="final-total-${team.team_id}">${totalScore.toFixed(2)}</span></td>
      <td>
        <span class="badge ${team.disqualified ? 'badge-dq' : 'badge-active'}">
          ${team.disqualified ? 'DQ' : 'Active'}
        </span>
      </td>
      <td>
        <button class="btn-judge btn-export" style="padding: 6px 10px; font-size: 0.72rem;" onclick="toggleSubmissions('${team.team_id}')">
          Submissions
        </button>
      </td>
    `;
    
    // Hidden row for submissions
    const subTr = document.createElement('tr');
    subTr.id = `sub-${team.team_id}`;
    subTr.style.display = 'none';
    
    let subHtml = `<td colspan="10" class="submissions-drawer">
      <div class="submissions-flex">`;
    
    if (team.submissions.length === 0) {
      subHtml += '<p style="color: #8892b0; font-style: italic;">No submissions yet.</p>';
    } else {
      team.submissions.forEach((s, i) => {
        subHtml += `
          <div class="sub-card">
            <p style="font-size: 0.8rem; margin-bottom: 8px;">Attempt ${i+1}</p>
            <img src="${s.image_path}" alt="Attempt ${i+1}">
            <div class="sub-details">
              <p>CLIP: ${s.clip_score.toFixed(2)}</p>
              <p>Gemini: ${s.gemini_score.toFixed(2)}</p>
              <p style="font-weight: bold; color: #60a5fa; margin-top: 4px;">Final: ${s.final_score.toFixed(2)}</p>
            </div>
            <p style="font-size: 0.65rem; color: #4a5578; margin-top: 8px; word-break: break-all;">
              "${s.prompt}"
            </p>
          </div>
        `;
      });
    }
    subHtml += '</div></td>';
    subTr.innerHTML = subHtml;

    leaderboardBody.appendChild(tr);
    leaderboardBody.appendChild(subTr);
  });
}

function toggleSubmissions(teamId) {
  const row = document.getElementById(`sub-${teamId}`);
  const drawer = row.querySelector('.submissions-drawer');
  if (row.style.display === 'none') {
    row.style.display = 'table-row';
    drawer.style.display = 'block';
  } else {
    row.style.display = 'none';
    drawer.style.display = 'none';
  }
}

async function updateRound2Rubric(teamId) {
  const creativityInput = document.getElementById(`rubric-creativity-${teamId}`);
  const accuracyInput = document.getElementById(`rubric-accuracy-${teamId}`);
  const round2El = document.getElementById(`round2-auto-${teamId}`);
  const finalTotalEl = document.getElementById(`final-total-${teamId}`);

  if (!creativityInput || !accuracyInput) return;

  const fallbackBreakdown = { creativity: 0, accuracy: 0 };
  const team = teamsData.find((t) => t.team_id === teamId);
  const previous = team ? getRubricBreakdown(team) : fallbackBreakdown;

  const payload = {
    team_id: teamId,
    creativity: clampRubricScore(creativityInput.value, previous.creativity),
    accuracy: clampRubricScore(accuracyInput.value, previous.accuracy)
  };

  creativityInput.value = String(payload.creativity);
  accuracyInput.value = String(payload.accuracy);

  const optimisticRound2 = calculateRound2ScoreFromRubric(payload);
  if (round2El) round2El.textContent = optimisticRound2.toFixed(2);
  if (finalTotalEl && team) {
    finalTotalEl.textContent = (team.best_score + optimisticRound2).toFixed(2);
  }

  try {
    const res = await fetch('/api/admin/score', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${judgeToken}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to save rubric scores.');
    }

    const updatedTeamIndex = teamsData.findIndex((t) => t.team_id === teamId);
    if (updatedTeamIndex !== -1) {
      teamsData[updatedTeamIndex] = data.team;
    }

    renderLeaderboard();
  } catch (err) {
    console.error('Failed to update rubric score:', err);
    fetchLeaderboard();
  }
}

function logout() {
  localStorage.removeItem('techfusion_judge_token');
  window.location.href = '/judge';
}

// PDF Export
function exportPDF() {
  const element = document.getElementById('leaderboard-content');
  const opt = {
    margin:       10,
    filename:     'think-to-build-leaderboard.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, backgroundColor: '#050a18' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().set(opt).from(element).save();
}


// Particles from main (simplified version)
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  class P {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.r = Math.random() * 2;
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if(this.x<0||this.x>canvas.width)this.vx*=-1;
      if(this.y<0||this.y>canvas.height)this.vy*=-1;
    }
    draw() {
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.2)'; ctx.fill();
    }
  }
  
  for(let i=0; i<50; i++) particles.push(new P());
  
  function animate() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }
  
  window.addEventListener('resize', resize);
  resize(); animate();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log('Judge Dashboard Initialized');
  initParticles();
  if (judgeToken) {
    fetchLeaderboard();
  } else {
    console.warn('Redirecting to login: Token missing');
    window.location.href = '/judge';
  }
});
