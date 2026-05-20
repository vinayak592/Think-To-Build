const fs = require('fs');
const path = require('path');

const dummyImagePath = path.join(__dirname, 'dummy.png');

async function downloadImage() {
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.writeFileSync(dummyImagePath, Buffer.from(base64Png, 'base64'));
}


async function testFlow() {
  try {
    await downloadImage();
    console.log("1. Authenticating as admin...");
    let res = await fetch('http://localhost:3004/api/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin456@gmail.com', password: 'admin456' })
    });
    let data = await res.json();
    if (!data.success) throw new Error("Admin login failed: " + JSON.stringify(data));
    const adminToken = data.token;
    console.log("Admin token received.");

    console.log("2. Uploading target image...");
    const formDataTarget = new FormData();
    const targetBlob = new Blob([fs.readFileSync(dummyImagePath)], { type: 'image/png' });
    formDataTarget.append('target', targetBlob, 'dummy.png');

    res = await fetch('http://localhost:3004/api/admin/upload-target', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: formDataTarget
    });
    data = await res.json();
    if (!data.success) throw new Error("Upload target failed: " + JSON.stringify(data));
    console.log("Target uploaded:", data.path);

    console.log("3. Starting event...");
    res = await fetch('http://localhost:3004/api/event/start', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    data = await res.json();
    if (!data.success) throw new Error("Event start failed: " + JSON.stringify(data));
    console.log("Event started.");

    console.log("4. Registering test team...");
    const teamEmail = `test${Date.now()}@test.com`;
    res = await fetch('http://localhost:3004/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: teamEmail,
        team_name: 'Test Team',
        participant_name: 'Test User'
      })
    });
    data = await res.json();
    if (!data.success) throw new Error("Register failed: " + JSON.stringify(data));
    const teamToken = data.token;
    const teamId = data.team_id;
    console.log("Team registered:", teamId);

    console.log("5. Uploading participant image to get score...");
    const formDataParticipant = new FormData();
    formDataParticipant.append('images', targetBlob, 'dummy.png');

    res = await fetch('http://localhost:3004/api/upload-images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teamToken}` },
      body: formDataParticipant
    });
    data = await res.json();
    if (!data.success) throw new Error("Participant upload failed: " + JSON.stringify(data));
    
    console.log("================================");
    console.log("SUCCESS! Scoring complete.");
    console.log("Score Data:", JSON.stringify(data, null, 2));
    console.log("================================");

  } catch(e) {
    console.error(e.message || e);
  } finally {
    if (fs.existsSync(dummyImagePath)) fs.unlinkSync(dummyImagePath);
  }
}
testFlow();
