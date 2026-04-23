const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { evaluateImage } = require('./services/ai');
const { evaluateClipSimilarity } = require('./services/clip');

async function testScores() {
  const generatedImagePath = path.join(__dirname, 'uploads/reference/reference.jpg');
  const referenceImagePath = path.join(__dirname, 'uploads/reference/reference.jpg');

  try {
    console.log('Testing Gemini Score...');
    const geminiScore = await evaluateImage('test prompt', generatedImagePath, referenceImagePath);
    console.log('Gemini Score:', geminiScore);

    console.log('Testing CLIP Score...');
    const clipScore = await evaluateClipSimilarity(generatedImagePath, referenceImagePath);
    console.log('CLIP Score:', clipScore);
  } catch (err) {
    console.error('Test Failed:', err);
  }
}

testScores();
