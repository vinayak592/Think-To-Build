const express = require('express');
const router = express.Router();
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const Team = require('../models/Team');
const EventState = require('../models/EventState');
const { generateImage, evaluateImage } = require('../services/ai');
const { evaluateClipSimilarity } = require('../services/clip');

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// Middleware to check roles
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied. Insufficient privileges.' });
    }
    next();
  };
}

// Helper to Trigger Pusher Events
function triggerSync(req, event, data = {}) {
  const pusher = req.app.get('pusher');
  if (pusher) {
    pusher.trigger('tech-fusion-channel', event, data);
  }
}

// Generate unique Team ID: TEAM-XXXXXX
function generateTeamId() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `TEAM-${randomNum}`;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, team_name } = req.body;
    
    if (!email || !team_name) {
      return res.status(400).json({ error: 'Email and Team Name are required.' });
    }

    const existingTeam = await Team.findOne({ email });
    if (existingTeam) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    let team_id;
    let isUnique = false;
    while (!isUnique) {
      team_id = generateTeamId();
      const checkId = await Team.findOne({ team_id });
      if (!checkId) isUnique = true;
    }

    const team = new Team({ team_id, email, team_name });
    await team.save();

    // Issue JWT
    const token = jwt.sign({ team_id: team.team_id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '4h' });

    res.json({ success: true, team_id: team.team_id, token, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'Team ID required' });

    const team = await Team.findOne({ team_id });
    if (!team) {
      return res.status(404).json({ error: 'Team not found. Please register first.' });
    }

    if (team.disqualified) {
      return res.status(403).json({ error: 'This team has been disqualified and cannot login.' });
    }

    // Issue JWT
    const token = jwt.sign({ team_id: team.team_id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '4h' });

    res.json({ success: true, token, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ADMIN & JUDGE AUTH =====

// Admin Login
router.post('/auth/admin', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin456@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin456';

  if (email === adminEmail && password === adminPassword) {
    const token = jwt.sign(
      { role: 'admin', email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );
    return res.json({ success: true, token, role: 'admin' });
  }
  return res.status(401).json({ error: 'Invalid admin credentials.' });
});

// Judge Login
router.post('/auth/judge', (req, res) => {
  const { email, password } = req.body;
  const judgeEmail = process.env.JUDGE_EMAIL || 'judges456@gmail.com';
  const judgePassword = process.env.JUDGE_PASSWORD || 'judges456';

  if (email === judgeEmail && password === judgePassword) {
    const token = jwt.sign(
      { role: 'judge', email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );
    return res.json({ success: true, token, role: 'judge' });
  }
  return res.status(401).json({ error: 'Invalid judge credentials.' });
});

// ===== EVENT STATE CONTROL =====

// Get public config (Pusher key)
router.get('/config', (req, res) => {
  res.json({
    pusher_key: process.env.PUSHER_KEY,
    pusher_cluster: process.env.PUSHER_CLUSTER
  });
});

// Update status to include public
router.get('/event/status', async (req, res) => {
  try {
    let state = await EventState.findOne({ key: 'main' });
    if (!state) {
      state = await EventState.create({ key: 'main', event_started: false });
    }
    res.json({ event_started: state.event_started, started_at: state.started_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start event (admin only)
router.post('/event/start', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can start the event.' });
  }
  try {
    await EventState.findOneAndUpdate(
      { key: 'main' },
      { 
        event_started: true, 
        started_at: new Date(),
        started_by: req.user.email 
      },
      { upsert: true }
    );

    triggerSync(req, 'event_started');

    res.json({ success: true, event_started: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop event (admin only)
router.post('/event/stop', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can stop the event.' });
  }
  try {
    await EventState.findOneAndUpdate(
      { key: 'main' },
      { event_started: false },
      { upsert: true }
    );

    triggerSync(req, 'event_stopped');

    res.json({ success: true, event_started: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disqualify
router.post('/disqualify', authenticateToken, async (req, res) => {
  try {
    const team_id = req.user.team_id; 
    const team = await Team.findOneAndUpdate({ team_id }, { disqualified: true }, { new: true });
    
    triggerSync(req, 'leaderboard_update');

    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track active submissions
const activeSubmissions = new Set();

// Submit Prompt (Protected by JWT)
router.post('/submit', authenticateToken, async (req, res) => {
  const team_id = req.user.team_id;
  const { prompt } = req.body;
  const cloudinary = req.app.get('cloudinary');

  if (!prompt || typeof prompt !== 'string' || prompt.length > 500) {
    return res.status(400).json({ error: 'Prompt must be a string and under 500 characters' });
  }

  if (activeSubmissions.has(team_id)) {
    return res.status(429).json({ error: 'A submission is already in progress. Please wait.' });
  }

  activeSubmissions.add(team_id);

  try {
    const eventState = await EventState.findOne({ key: 'main' });
    if (!eventState || !eventState.event_started) {
      throw new Error('Event has not started yet.');
    }

    const team = await Team.findOne({ team_id });
    if (!team || team.disqualified || team.submissions.length >= 3) {
      throw new Error('Invalid submission state (Max attempts 3 or disqualified).');
    }

    // 1. Generate Image to Temp Path (using OS temp or Vercel /tmp)
    const tempImageName = `${team_id}_${Date.now()}.jpg`;
    const tempPath = path.join('/tmp', tempImageName);
    const referenceImagePath = path.join(__dirname, '../public/reference.jpg'); // Moved to public for Vercel

    await generateImage(prompt, tempPath);

    // 2. Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: 'tech-fusion/generated',
      public_id: tempImageName.split('.')[0]
    });

    const cloudinaryUrl = uploadResult.secure_url;

    // 3. Evaluate CLIP & Gemini (Using URLs)
    let clipScore = await evaluateClipSimilarity(cloudinaryUrl, referenceImagePath);
    let geminiScore = await evaluateImage(prompt, cloudinaryUrl, referenceImagePath);

    clipScore = Math.max(0, Math.min(100, Number(clipScore) || 0));
    geminiScore = Math.max(0, Math.min(100, Number(geminiScore) || 0));
    let finalScore = Math.round(((0.6 * clipScore) + (0.4 * geminiScore)) * 100) / 100;

    // 4. Save Submission
    team.submissions.push({
      prompt,
      image_path: cloudinaryUrl,
      clip_score: clipScore,
      gemini_score: geminiScore,
      final_score: finalScore
    });

    if (finalScore > team.best_score) team.best_score = finalScore;
    await team.save();

    triggerSync(req, 'leaderboard_update');

    // Clean up /tmp
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    res.json({
      success: true,
      submission: team.submissions[team.submissions.length - 1],
      best_score: team.best_score
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    activeSubmissions.delete(team_id);
  }
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const teams = await Team.find({ disqualified: false }).sort({ best_score: -1 }).limit(25);
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// All Teams for Admin
router.get('/admin/teams', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const teams = await Team.find().sort({ best_score: -1 });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Round 2 Scoring
router.post('/admin/score', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const { team_id, round2_score } = req.body;
    const team = await Team.findOneAndUpdate({ team_id }, { round2_score: Number(round2_score) }, { new: true });
    
    triggerSync(req, 'leaderboard_update');
    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

