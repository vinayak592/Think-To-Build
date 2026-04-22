const socket = io();
const leaderboardBody = document.getElementById('leaderboard-body');
let teamsData = [];
let judgeToken = localStorage.getItem('techfusion_judge_token');

// Redirect to login if no token
if (!judgeToken) {
  window.location.href = '/judge';
}

// Fetch and render leaderboard
async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/admin/teams', {
      headers: {
        'Authorization': `Bearer ${judgeToken}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    teamsData = await res.json();
    renderLeaderboard();
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
  }
}

function renderLeaderboard() {
  leaderboardBody.innerHTML = '';
  
  // Sort: Not disqualified first, then by final_total_score descending
  teamsData.sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const aTotal = a.best_score + a.round2_score;
    const bTotal = b.best_score + b.round2_score;
    return bTotal - aTotal;
  });

  teamsData.forEach((team, index) => {
    const totalScore = team.best_score + team.round2_score;
    const tr = document.createElement('tr');
    tr.className = `team-row ${team.disqualified ? 'disqualified' : ''}`;
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="team-id-cell">${team.team_id}</div>
        <div style="font-size:0.75rem; color:#8892b0;">${team.team_name || 'No Name'}</div>
      </td>
      <td>${team.submissions.length} / 3</td>
      <td>${team.best_score.toFixed(2)}</td>
      <td>
        <input type="number" 
               class="score-input"
               value="${team.round2_score}" 
               min="0" max="100" 
               onchange="updateRound2Score('${team.team_id}', this.value)"
               ${team.disqualified ? 'disabled' : ''}>
      </td>
      <td><span class="final-score">${totalScore.toFixed(2)}</span></td>
      <td>
        <span class="badge ${team.disqualified ? 'badge-dq' : 'badge-active'}">
          ${team.disqualified ? 'DQ' : 'Active'}
        </span>
      </td>
      <td>
        <button class="btn-judge btn-export" style="padding: 6px 12px; font-size: 0.75rem;" onclick="toggleSubmissions('${team.team_id}')">
          View Submissions
        </button>
      </td>
    `;
    
    // Hidden row for submissions
    const subTr = document.createElement('tr');
    subTr.id = `sub-${team.team_id}`;
    subTr.style.display = 'none';
    
    let subHtml = `<td colspan="8" class="submissions-drawer">
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

async function updateRound2Score(teamId, score) {
  try {
    const res = await fetch('/api/admin/score', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${judgeToken}`
      },
      body: JSON.stringify({ team_id: teamId, round2_score: score })
    });
    
    if (res.status === 401 || res.status === 403) {
      logout();
    }
  } catch (err) {
    console.error('Failed to update score:', err);
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
    filename:     'tech-fusion-leaderboard.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, backgroundColor: '#050a18' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().set(opt).from(element).save();
}

// Real-time updates
socket.on('leaderboard_update', () => {
  fetchLeaderboard();
});

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
  initParticles();
  fetchLeaderboard();
});
