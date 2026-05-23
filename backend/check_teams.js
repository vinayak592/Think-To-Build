const fetch = require('node-fetch');
(async () => {
  try {
    // admin login
    let res = await fetch('http://localhost:3005/api/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin456@gmail.com', password: 'admin456' })
    });
    let data = await res.json();
    if (!data.success) { console.error('Login failed', data); process.exit(1); }
    const token = data.token;
    // fetch teams
    res = await fetch('http://localhost:3005/api/admin/teams', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const teams = await res.json();
    console.log('Teams count:', teams.length);
    // optionally list some ids
    console.log(teams.map(t=>t.team_id).slice(0,5));
  } catch (e) { console.error('Error', e); }
})();
