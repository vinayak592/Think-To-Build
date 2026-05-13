const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3004/api';

// Create a valid 1x1 transparent PNG
const dummyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const targetPath = path.join(__dirname, 'test_target.jpg');
const participantPath = path.join(__dirname, 'test_participant.jpg');

fs.writeFileSync(targetPath, Buffer.from(dummyImageBase64, 'base64'));
fs.writeFileSync(participantPath, Buffer.from(dummyImageBase64, 'base64'));

async function runTest() {
  try {
    console.log('1. Admin Login...');
    const adminRes = await axios.post(`${BASE_URL}/auth/admin`, {
      email: 'admin456@gmail.com',
      password: 'admin456'
    });
    const adminToken = adminRes.data.token;
    console.log('Admin login successful.');

    console.log('\n2. Upload Target Image...');
    const targetForm = new FormData();
    targetForm.append('target', fs.createReadStream(targetPath));
    const targetRes = await axios.post(`${BASE_URL}/admin/upload-target`, targetForm, {
      headers: {
        ...targetForm.getHeaders(),
        Authorization: `Bearer ${adminToken}`
      }
    });
    console.log('Target upload successful:', targetRes.data);

    console.log('\n3. Start Event...');
    await axios.post(`${BASE_URL}/event/start`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('Event started.');

    console.log('\n4. Register Team...');
    const teamRes = await axios.post(`${BASE_URL}/register`, {
      email: `test${Date.now()}@test.com`,
      team_name: 'Test Team',
      participant_name: 'Test User'
    });
    const teamToken = teamRes.data.token;
    console.log('Team registration successful. Token:', teamToken);

    console.log('\n5. Upload Participant Images...');
    const partForm = new FormData();
    partForm.append('images', fs.createReadStream(participantPath));
    partForm.append('images', fs.createReadStream(participantPath));
    
    const uploadRes = await axios.post(`${BASE_URL}/upload-images`, partForm, {
      headers: {
        ...partForm.getHeaders(),
        Authorization: `Bearer ${teamToken}`
      }
    });
    console.log('\n--- SUCCESS! ---');
    console.log('Participant upload response:', JSON.stringify(uploadRes.data, null, 2));

  } catch (err) {
    console.error('\n--- TEST FAILED ---');
    if (err.response) {
      console.error('Response Error:', err.response.data);
    } else {
      console.error(err.message);
    }
  } finally {
    // Cleanup
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    if (fs.existsSync(participantPath)) fs.unlinkSync(participantPath);
  }
}

runTest();
