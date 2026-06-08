const fs = require('fs');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

function readEnv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

async function postJson(path, body, token) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const interval = setInterval(() => {
        const index = this.events.findIndex(event => event.method === method);
        if (index === -1) return;
        const [event] = this.events.splice(index, 1);
        clearInterval(interval);
        clearTimeout(timer);
        resolve(event.params);
      }, 25);
    });
  }

  close() {
    this.socket.close();
  }
}

async function navigate(client, command, params) {
  const loaded = client.waitForEvent('Page.loadEventFired');
  await client.send(command, params);
  await loaded;
  await new Promise(resolve => setTimeout(resolve, 800));
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result.value;
}

async function inspectPanel(client, panel) {
  client.events.length = 0;
  if (panel.storage) {
    await navigate(client, 'Page.navigate', { url: `${BASE_URL}/portals` });
    await evaluate(client, `Object.entries(${JSON.stringify(panel.storage)}).forEach(([key, value]) => localStorage.setItem(key, value))`);
    client.events.length = 0;
  }
  await navigate(client, 'Page.navigate', { url: `${BASE_URL}${panel.path}` });
  await new Promise(resolve => setTimeout(resolve, 1200));

  const state = await evaluate(client, `({
    title: document.title,
    path: location.pathname,
    rows: document.querySelectorAll('#leaderboard-body tr, #teams-body tr').length,
    scoreInputs: document.querySelectorAll('.score-input').length,
    dashboardVisible: [...document.querySelectorAll('#dashboard-container, #admin-dashboard')].some(el => getComputedStyle(el).display !== 'none'),
    eventControls: document.querySelectorAll('#btn-start-event, #btn-stop-event').length,
    visibleText: document.body.innerText.slice(0, 500)
  })`);

  const errors = client.events
    .filter(event => event.method === 'Runtime.exceptionThrown')
    .map(event => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);

  return { name: panel.name, ...state, errors };
}

async function main() {
  const env = readEnv('backend/.env');
  const judge = await postJson('/api/judge/login', {
    email: env.JUDGE1_EMAIL,
    password: env.JUDGE1_PASSWORD
  });
  const judge2 = await postJson('/api/judge/login', {
    email: env.JUDGE2_EMAIL,
    password: env.JUDGE2_PASSWORD
  });
  const admin = await postJson('/api/auth/admin', {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD
  });
  const teamsResponse = await fetch(`${BASE_URL}/api/teams`);
  const teams = await teamsResponse.json();
  const teamId = teams[0]?.team_id;
  const team = teamId ? await postJson('/api/login', { team_id: teamId }) : null;

  const target = await fetch(`${CDP_URL}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then(res => res.json());
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const panels = [
    { name: 'Portals', path: '/portals' },
    { name: 'Registration', path: '/register' },
    {
      name: 'Judge Round 1',
      path: '/judge-dashboard',
      storage: {
        techfusion_judge_token: judge.token,
        techfusion_judge_round: String(judge.round),
        techfusion_judge_email: env.JUDGE1_EMAIL
      }
    },
    {
      name: 'Judge Round 2',
      path: '/judge-dashboard',
      storage: {
        techfusion_judge_token: judge2.token,
        techfusion_judge_round: String(judge2.round),
        techfusion_judge_email: env.JUDGE2_EMAIL
      }
    },
    {
      name: 'Admin',
      path: '/admin',
      storage: {
        techfusion_admin_token: admin.token,
        techfusion_admin_email: env.ADMIN_EMAIL
      }
    },
    ...(team ? [{
      name: 'Participant',
      path: '/dashboard',
      storage: {
        techfusion_token: team.token,
        techfusion_team_id: teamId
      }
    }] : [])
  ];

  const results = [];
  for (const panel of panels) results.push(await inspectPanel(client, panel));

  const adminTeams = await fetch(`${BASE_URL}/api/admin/teams`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  }).then(res => res.json());
  const scoreTeam = adminTeams[0];
  const scoreUpdate = scoreTeam ? await postJson('/api/admin/score', {
    team_id: scoreTeam.team_id,
    round: judge.round,
    innovation: scoreTeam.round1_breakdown?.innovation || 0,
    implementation: scoreTeam.round1_breakdown?.implementation || 0
  }, judge.token) : null;

  client.close();
  console.log(JSON.stringify({
    panels: results,
    scoreUpdate: scoreUpdate ? {
      success: scoreUpdate.success,
      team_id: scoreUpdate.team.team_id,
      round1_score: scoreUpdate.team.round1_score
    } : null
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
