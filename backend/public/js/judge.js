const socket = io();

// Real-time synchronization
socket.on('leaderboard_update', () => fetchLeaderboard());

const leaderboardBody = document.getElementById('leaderboard-body');
let teamsData = [];
let judgeToken = localStorage.getItem('techfusion_judge_token');
let judgeRound = parseInt(localStorage.getItem('techfusion_judge_round')) || 1;
let judgeEmail = localStorage.getItem('techfusion_judge_email') || 'judge';

function clampRubricScore(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(50, num));
}

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

// Redirect to login if no token
if (!judgeToken) {
  window.location.href = '/judge';
}

// Update UI headers based on the current judge round
function setupHeaders() {
  const headerRow = document.querySelector('.leaderboard-table thead tr');
  if (!headerRow) return;

  if (judgeRound === 1) {
    headerRow.innerHTML = `
      <th style="width: 80px;">Rank</th>
      <th style="width: 250px;">Team ID & Participant</th>
      <th style="width: 220px;">Submissions</th>
      <th>Innovation 💡 (0-50)</th>
      <th>Implementation ⚙️ (0-50)</th>
      <th>Round 1 Total (0-100)</th>
    `;
    document.querySelector('.judge-title p').textContent = 'Evaluation Phase: Round 1 (Innovation & Implementation)';
    const formulaEl = document.getElementById('total-score-formula');
    if (formulaEl) formulaEl.textContent = 'Round 1 Score = Innovation + Implementation';
  } else {
    headerRow.innerHTML = `
      <th style="width: 80px;">Rank</th>
      <th style="width: 220px;">Team ID & Participant</th>
      <th style="width: 150px;">Submissions</th>
      <th>Round 1 Score</th>
      <th>Feasibility 🎯 (0-50)</th>
      <th>Impact 🚀 (0-50)</th>
      <th>Round 2 Score</th>
      <th>Final Score (0-200)</th>

    `;
    document.querySelector('.judge-title p').textContent = 'Evaluation Phase: Round 2 (Feasibility & Impact)';
    const formulaEl = document.getElementById('total-score-formula');
    if (formulaEl) formulaEl.textContent = 'Final Score = Round 1 Score + Round 2 Score';
  }

  // Display judge info
  const infoEl = document.createElement('p');
  infoEl.style.cssText = 'font-size: 0.85rem; color: #a78bfa; margin-top: 4px;';
  infoEl.textContent = `Logged in as: ${judgeEmail} (Round ${judgeRound} Judge)`;
  document.querySelector('.judge-title').appendChild(infoEl);
}

// Fetch and render leaderboard
async function fetchLeaderboard() {
  console.log('Fetching leaderboard data...');
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

    if (res.status === 401 || res.status === 403) {
      console.warn('Unauthorized access, logging out...');
      logout();
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }

    teamsData = await res.json();
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
  
  // Show all teams regardless of disqualification or qualification
  let qualifiedTeams = [];
  if (judgeRound === 1) {
    // Round 1 shows all registered teams
    qualifiedTeams = teamsData;
  } else {
    // Round 2 also shows all registered teams
    qualifiedTeams = teamsData;
  }

  // Sort by appropriate score descending, but only for teams with complete marks.
  if (judgeRound === 1) {
    const complete = [];
    const incomplete = [];
    qualifiedTeams.forEach(team => {
      const hasInnovation = team.round1_breakdown && ('innovation' in team.round1_breakdown);
      const hasImplementation = team.round1_breakdown && ('implementation' in team.round1_breakdown);
      if (hasInnovation && hasImplementation) complete.push(team);
      else incomplete.push(team);
    });
    complete.sort((a, b) => (b.round1_score || 0) - (a.round1_score || 0));
    qualifiedTeams = [...complete, ...incomplete];
  } else {
    const complete = [];
    const incomplete = [];
    qualifiedTeams.forEach(team => {
      const hasCreativity = team.round2_breakdown && ('creativity' in team.round2_breakdown);
      const hasAccuracy = team.round2_breakdown && ('accuracy' in team.round2_breakdown);
      if (hasCreativity && hasAccuracy) complete.push(team);
      else incomplete.push(team);
    });
    complete.sort((a, b) => {
      const totalA = (a.round1_score || 0) + (a.round2_score || 0);
      const totalB = (b.round1_score || 0) + (b.round2_score || 0);
      return totalB - totalA;
    });
    qualifiedTeams = [...complete, ...incomplete];
  }

  qualifiedTeams.forEach((team, index) => {
    const tr = document.createElement('tr');
    tr.className = 'team-row';
    
    // Render images column
    let imagesHtml = '<span style="font-size: 0.8rem; color: #4a5578;">No uploads</span>';
    if (team.round1_images && team.round1_images.length > 0) {
      imagesHtml = `<div style="display: flex; gap: 6px; flex-wrap: wrap;">`;
      team.round1_images.forEach((img, i) => {
        imagesHtml += `
          <img src="${img.image_path}" 
               alt="Sub ${i+1}" 
               style="width: 38px; height: 38px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;"
               onclick="viewFullImage('${img.image_path}', '${team.team_id}')"
               title="Score: ${img.score}%">
        `;
      });
      imagesHtml += `</div>`;
    }

    if (judgeRound === 1) {
      const innovationVal = team.round1_breakdown?.innovation || 0;
      const implementationVal = team.round1_breakdown?.implementation || 0;
      const r1Total = team.round1_score || 0;

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>
          <div class="team-id-cell">${team.team_id}</div>
          <div style="font-size:0.85rem; font-weight:600; color:#cbd5e1;">${team.participant_name || 'No Name'}</div>
          <div style="font-size:0.75rem; color:#8892b0;">${team.team_name || ''}</div>
        </td>
        <td>${imagesHtml}</td>
        <td>
          <input type="number" 
                 class="score-input"
                 id="innovation-${team.team_id}"
                 value="${innovationVal}" 
                 min="0" max="50" step="0.5"
                 onchange="updateScore('${team.team_id}')"
                 ${team.disqualified ? 'disabled' : ''}>
        </td>
        <td>
          <input type="number" 
                 class="score-input"
                 id="implementation-${team.team_id}"
                 value="${implementationVal}" 
                 min="0" max="50" step="0.5"
                 onchange="updateScore('${team.team_id}')">
        </td>
        <td><span class="final-score" id="total-${team.team_id}" style="color: #60a5fa;">${r1Total.toFixed(2)}</span></td>
      `;
    } else {
      // Round 2
      const feasibilityVal = team.round2_breakdown?.creativity || 0;
      const impactVal = team.round2_breakdown?.accuracy || 0;
      const r1Total = team.round1_score || 0;
      const r2Total = team.round2_score || 0;
      const finalTotal = r1Total + r2Total;

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>
          <div class="team-id-cell">${team.team_id}</div>
          <div style="font-size:0.85rem; font-weight:600; color:#cbd5e1;">${team.participant_name || 'No Name'}</div>
          <div style="font-size:0.75rem; color:#8892b0;">${team.team_name || ''}</div>
        </td>
        <td>${imagesHtml}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; color: #a78bfa;">${r1Total.toFixed(2)}</td>
        <td>
          <input type="number" 
                 class="score-input"
                 id="feasibility-${team.team_id}"
                 value="${feasibilityVal}" 
                 min="0" max="50" step="0.5"
                 onchange="updateScore('${team.team_id}')"
                 ${team.disqualified ? 'disabled' : ''}>
        </td>
        <td>
          <input type="number" 
                 class="score-input"
                 id="impact-${team.team_id}"
                 value="${impactVal}" 
                 min="0" max="50" step="0.5"
                 onchange="updateScore('${team.team_id}')"
                 onchange="updateScore('${team.team_id}')">
        </td>
        <td><span class="final-score" id="total2-${team.team_id}" style="color: #f472b6;">${r2Total.toFixed(2)}</span></td>
        <td><span class="final-score" id="grand-total-${team.team_id}" style="color: #34d399; font-size: 1.2rem;">${finalTotal.toFixed(2)}</span></td>
      `;
    }

    leaderboardBody.appendChild(tr);
  });
}

async function updateScore(teamId) {
  let payload = { team_id: teamId, round: judgeRound };

  if (judgeRound === 1) {
    const innovationInput = document.getElementById(`innovation-${teamId}`);
    const implementationInput = document.getElementById(`implementation-${teamId}`);
    const totalEl = document.getElementById(`total-${teamId}`);

    if (!innovationInput || !implementationInput) return;

    const innovation = clampRubricScore(innovationInput.value);
    const implementation = clampRubricScore(implementationInput.value);

    innovationInput.value = innovation;
    implementationInput.value = implementation;

    payload.innovation = innovation;
    payload.implementation = implementation;

    // Optimistically update UI
    if (totalEl) {
      totalEl.textContent = (innovation + implementation).toFixed(2);
    }
  } else {
    const feasibilityInput = document.getElementById(`feasibility-${teamId}`);
    const impactInput = document.getElementById(`impact-${teamId}`);
    const total2El = document.getElementById(`total2-${teamId}`);
    const grandTotalEl = document.getElementById(`grand-total-${teamId}`);

    if (!feasibilityInput || !impactInput) return;

    const feasibility = clampRubricScore(feasibilityInput.value);
    const impact = clampRubricScore(impactInput.value);

    feasibilityInput.value = feasibility;
    impactInput.value = impact;

    // Map Feasibility to creativity, Impact to accuracy in backend schema
    payload.creativity = feasibility;
    payload.accuracy = impact;

    // Optimistically update UI
    const r1Score = parseFloat(teamsData.find(t => t.team_id === teamId)?.round1_score || 0);
    const r2Total = feasibility + impact;
    if (total2El) total2El.textContent = r2Total.toFixed(2);
    if (grandTotalEl) grandTotalEl.textContent = (r1Score + r2Total).toFixed(2);
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
      throw new Error(data.error || 'Failed to save scores.');
    }

    // Update local data
    const idx = teamsData.findIndex(t => t.team_id === teamId);
    if (idx !== -1) {
      teamsData[idx] = data.team;
    }
  } catch (err) {
    console.error('Failed to update rubric score:', err);
    fetchLeaderboard();
  }
}

// Modal for viewing image full size
function viewFullImage(src, teamId) {
  let modal = document.getElementById('image-view-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'image-view-modal';
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 10000; background: rgba(5,10,24,0.9); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px;';
    modal.onclick = () => modal.style.display = 'none';
    
    const img = document.createElement('img');
    img.id = 'modal-image-content';
    img.style.cssText = 'max-width: 90%; max-height: 80%; border-radius: 12px; border: 2px solid rgba(96,165,250,0.3); object-fit: contain; margin-bottom: 20px;';
    
    const title = document.createElement('h3');
    title.id = 'modal-image-title';
    title.style.cssText = 'color: #fff; font-family: Orbitron, sans-serif; letter-spacing: 1px;';
    
    const closeMsg = document.createElement('p');
    closeMsg.style.cssText = 'color: #8892b0; font-size: 0.8rem; margin-top: 10px;';
    closeMsg.textContent = 'Click anywhere to close';

    modal.appendChild(img);
    modal.appendChild(title);
    modal.appendChild(closeMsg);
    document.body.appendChild(modal);
  }
  
  document.getElementById('modal-image-content').src = src;
  document.getElementById('modal-image-title').textContent = `Submission for Team: ${teamId}`;
  modal.style.display = 'flex';
}

function logout() {
  localStorage.removeItem('techfusion_judge_token');
  localStorage.removeItem('techfusion_judge_round');
  localStorage.removeItem('techfusion_judge_email');
  window.location.href = '/judge';
}

// PDF Export
function exportPDF() {
  const element = document.getElementById('leaderboard-content');
  const opt = {
    margin:       10,
    filename:     `think-to-build-round-${judgeRound}-leaderboard.pdf`,
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
  setupHeaders();
  initParticles();
  if (judgeToken) {
    fetchLeaderboard();
  } else {
    console.warn('Redirecting to login: Token missing');
    window.location.href = '/judge';
  }
});
