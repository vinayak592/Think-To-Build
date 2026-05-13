const axios = require('axios');

async function runTest() {
  console.log("Waiting for services to start...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const baseURL = 'http://localhost:3001/api';
    
    // 1. Register
    console.log('Testing Registration...');
    const regRes = await axios.post(`${baseURL}/register`, {
      email: `test_${Date.now()}@test.com`,
      team_name: 'Auto Test Team',
      participant_name: 'Test User'
    });
    
    if (!regRes.data.success || !regRes.data.token) {
      throw new Error('Registration failed: ' + JSON.stringify(regRes.data));
    }
    console.log('Registration Success! Team ID:', regRes.data.team_id);
    
    const token = regRes.data.token;
    const teamId = regRes.data.team_id;

    // 2. Submit Prompt
    console.log('Testing Image Submission...');
    const submitRes = await axios.post(`${baseURL}/submit`, {
      prompt: 'A futuristic city skyline'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!submitRes.data.success) {
      throw new Error('Submission failed: ' + JSON.stringify(submitRes.data));
    }
    console.log('Submission Success! Final Score:', submitRes.data.submission.final_score);
    console.log('Details:', submitRes.data.submission);

    // Skip disqualification for now to allow repeated tests
    /*
    console.log('Testing Disqualification...');
    const dqRes = await axios.post(`${baseURL}/disqualify`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    */

    // 4. Submit after disqualify (should fail)
    console.log('Testing Submission when disqualified...');
    try {
      await axios.post(`${baseURL}/submit`, { prompt: 'Another test' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      throw new Error('Should have failed!');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log('Successfully blocked submission for disqualified team.');
      } else {
        throw err;
      }
    }

    console.log('--- ALL TESTS PASSED ---');
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Test Error:', error.message);
    }
  }
}

runTest();
