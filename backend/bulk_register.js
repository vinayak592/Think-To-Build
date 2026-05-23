const fetch = require('node-fetch').default;
(async () => {
  try {
    // No need for admin login; registration is open
    const promises = [];
    for (let i = 0; i < 50; i++) {
      const email = `bulk${i}_${Date.now()}@example.com`;
      const payload = {
        email,
        team_name: `Bulk Team ${i}`,
        participant_name: `Participant ${i}`
      };
      const p = fetch('http://localhost:3005/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            console.log(`✅ Registered ${data.team_id}`);
          } else {
            console.error(`❌ Failed ${email}: ${data.error || 'unknown'}`);
          }
        })
        .catch(err => console.error(`❌ Network error for ${email}: ${err.message}`));
      promises.push(p);
    }
    await Promise.all(promises);
    console.log('All registration attempts completed.');
  } catch (e) {
    console.error('Error during bulk registration:', e);
  }
})();
