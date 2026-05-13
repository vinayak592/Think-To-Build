const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Simple Queue to limit concurrent CLIP requests and prevent Python microservice from OOM
const queue = [];
let activeRequests = 0;
const MAX_CONCURRENT = 2; // Limit to 2 concurrent requests

async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;
  
  activeRequests++;
  const { targetImagePath, participantImagePath, resolve, reject } = queue.shift();
  
  try {
    const clipServiceUrl = process.env.CLIP_SERVICE_URL || 'http://127.0.0.1:5000';
    
    // Build multipart form-data with both images
    const form = new FormData();
    form.append('img1', fs.createReadStream(targetImagePath));
    form.append('img2', fs.createReadStream(participantImagePath));

    const response = await axios.post(`${clipServiceUrl}/compare`, form, {
      headers: form.getHeaders(),
      timeout: 60000 // 60s timeout for CLIP processing
    });

    const score = Number(response.data.score);
    resolve(Number.isFinite(score) ? score : 0);
  } catch (error) {
    console.error('CLIP microservice comparison failed:', error.message);
    // Return a fallback score to prevent full app crash if Python service is down
    resolve(0);
  } finally {
    activeRequests--;
    processQueue();
  }
}

/**
 * Compare a participant image against the target image using CLIP.
 * @param {string} targetImagePath - Absolute path to the admin-uploaded target image
 * @param {string} participantImagePath - Absolute path to the participant-uploaded image
 * @returns {Promise<number>} Similarity score 0-100
 */
function compareImages(targetImagePath, participantImagePath) {
  return new Promise((resolve, reject) => {
    queue.push({ targetImagePath, participantImagePath, resolve, reject });
    processQueue();
  });
}

// Legacy alias for backward compatibility
function evaluateClipSimilarity(generatedImagePath, referenceImagePath) {
  return compareImages(referenceImagePath, generatedImagePath);
}

module.exports = {
  compareImages,
  evaluateClipSimilarity
};
