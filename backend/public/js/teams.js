const teamsBody = document.getElementById('teams-body');
const teamsTable = document.getElementById('teams-table');
const teamsStatus = document.getElementById('teams-status');
const teamCount = document.getElementById('team-count');
const generatedAt = document.getElementById('generated-at');
const refreshBtn = document.getElementById('refresh-btn');
const downloadPdfBtn = document.getElementById('download-pdf-btn');

let teams = [];

function setStatus(message, isError = false) {
  teamsStatus.textContent = message;
  teamsStatus.style.display = message ? 'block' : 'none';
  teamsStatus.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
}

function updateGeneratedAt() {
  generatedAt.textContent = `Generated on ${new Date().toLocaleString()}`;
}

function renderTeams() {
  teamsBody.innerHTML = '';
  teamCount.textContent = `${teams.length} ${teams.length === 1 ? 'Team' : 'Teams'}`;
  updateGeneratedAt();

  if (!teams.length) {
    teamsTable.style.display = 'none';
    setStatus('No teams have registered yet.');
    return;
  }

  teamsTable.style.display = 'table';
  setStatus('');

  teams.forEach((team, index) => {
    const row = document.createElement('tr');
    const serialCell = document.createElement('td');
    const nameCell = document.createElement('td');
    const idCell = document.createElement('td');

    serialCell.textContent = index + 1;
    nameCell.textContent = team.team_name || 'Unnamed Team';
    idCell.textContent = team.team_id;
    idCell.style.fontWeight = '800';

    row.append(serialCell, nameCell, idCell);
    teamsBody.appendChild(row);
  });
}

async function fetchTeams() {
  refreshBtn.disabled = true;
  setStatus('Loading teams...');
  teamsTable.style.display = 'none';

  try {
    const res = await fetch('/api/teams');
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Unable to load teams.');
    }

    teams = data;
    renderTeams();
  } catch (error) {
    teams = [];
    teamCount.textContent = '0 Teams';
    teamsTable.style.display = 'none';
    setStatus(error.message || 'Unable to load teams.', true);
  } finally {
    refreshBtn.disabled = false;
  }
}

function downloadPDF() {
  if (!teams.length) {
    setStatus('No teams available to download.');
    return;
  }

  const content = document.getElementById('teams-pdf-content');

  if (!window.html2pdf) {
    window.print();
    return;
  }

  const options = {
    margin: 10,
    filename: 'tech_fusion_team_ids.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(options).from(content).save();
}

refreshBtn.addEventListener('click', fetchTeams);
downloadPdfBtn.addEventListener('click', downloadPDF);

fetchTeams();
