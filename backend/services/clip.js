const axios = require('axios');

// Simple Queue to limit concurrent CLIP requests and prevent Python microservice from OOM
const queue = [];
let activeRequests = 0;
const MAX_CONCURRENT = 2; // Limit to 2 concurrent requests

async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;
  
  activeRequests++;
  const { generatedImagePath, referenceImagePath, resolve, reject } = queue.shift();
  
  try {
    const clipServiceUrl = process.env.CLIP_SERVICE_URL || 'http://127.0.0.1:5000';
    
    const response = await axios.post(`${clipServiceUrl}/evaluate`, {
      generated_image_path: generatedImagePath,
      reference_image_path: referenceImagePath
    });

    resolve(response.data.similarity_score);
  } catch (error) {
    console.error('CLIP microservice evaluation failed:', error.message);
    // Return a fallback score to prevent full app crash if Python service is down
    resolve(0);
  } finally {
    activeRequests--;
    processQueue();
  }
}

function evaluateClipSimilarity(generatedImagePath, referenceImagePath) {
  return new Promise((resolve, reject) => {
    queue.push({ generatedImagePath, referenceImagePath, resolve, reject });
    processQueue();
  });
}

module.exports = {
  evaluateClipSimilarity
};
