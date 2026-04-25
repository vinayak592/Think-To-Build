const express = require('express');
const router = express.Router();
const path = require('path');
const jwt = require('jsonwebtoken');
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

// Generate unique Team ID: TEAM-XXXXXX
function generateTeamId() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `TEAM-${randomNum}`;
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

// Registration Status
router.get('/registration-status', async (req, res) => {
  try {
    const teamCount = await Team.countDocuments();
    const isOpen = teamCount < 50;
    res.json({ open: isOpen, message: isOpen ? '' : 'Registration is closed. Maximum 50 teams allowed.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const teamCount = await Team.countDocuments();
    if (teamCount >= 50) {
      return res.status(400).json({ error: 'Registration is closed. Maximum 50 teams allowed.' });
    }

    const { email, team_name, participant_name, member_count, members } = req.body;
    
    if (!email || !team_name || !participant_name) {
      return res.status(400).json({ error: 'Email, Team Name, and Participant Name are required.' });
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

    const team = new Team({ team_id, email, team_name, participant_name });
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

// Get currently authenticated team (for dashboard sync)
router.get('/team/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user.team_id) {
      return res.status(403).json({ error: 'Team token required.' });
    }

    const team = await Team.findOne({ team_id: req.user.team_id });
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    res.json({ success: true, team });
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

// Get event status (public)
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
    const state = await EventState.findOneAndUpdate(
      { key: 'main' },
      { 
        event_started: true, 
        started_at: new Date(),
        started_by: req.user.email 
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Broadcast
    const io = req.app.get('io');
    if (io) io.emit('event_started');

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
    const state = await EventState.findOneAndUpdate(
      { key: 'main' },
      { event_started: false },
      { upsert: true, returnDocument: 'after' }
    );

    const io = req.app.get('io');
    if (io) io.emit('event_stopped');

    res.json({ success: true, event_started: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disqualify
router.post('/disqualify', authenticateToken, async (req, res) => {
  try {
    const team_id = req.user.team_id; 
    const team = await Team.findOneAndUpdate({ team_id }, { disqualified: true }, { returnDocument: 'after' });
    
    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

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
      throw new Error('Invalid submission state.');
    }

    // Generate local path
    const imageName = `${team_id}_${Date.now()}.jpg`;
    const imagePath = path.join(__dirname, '../uploads/generated', imageName);
    const referenceImagePath = path.join(__dirname, '../uploads/reference/reference.jpg');

    // 1. Generate Image (Local)
    await generateImage(prompt, imagePath);

    // 2. Evaluate (Local Paths)
    let clipScore = await evaluateClipSimilarity(imagePath, referenceImagePath);
    let geminiScore = await evaluateImage(prompt, imagePath, referenceImagePath);

    clipScore = Math.max(0, Math.min(100, Number(clipScore) || 0));
    geminiScore = Math.max(0, Math.min(100, Number(geminiScore) || 0));
    let finalScore = Math.round(((0.6 * clipScore) + (0.4 * geminiScore)) * 100) / 100;

    // 3. Save Submission
    team.submissions.push({
      prompt,
      image_path: `/uploads/generated/${imageName}`,
      clip_score: clipScore,
      gemini_score: geminiScore,
      final_score: finalScore
    });

    if (finalScore > team.best_score) team.best_score = finalScore;
    await team.save();

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

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

// Team list
router.get('/teams', async (req, res) => {
  try {
    const teams = await Team.find().select('team_id team_name participant_name').sort({ _id: 1 });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// All Teams (Admin)
router.get('/admin/teams', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const teams = await Team.find().sort({ best_score: -1 });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Score Update
router.post('/admin/score', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const { team_id, round2_score, creativity, accuracy } = req.body;

    if (!team_id) {
      return res.status(400).json({ error: 'team_id is required.' });
    }

    const existingTeam = await Team.findOne({ team_id });
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const existingFallbackCriterion = clampNumber((existingTeam.round2_score || 0) / 2, 0, 50, 0);
    const existingBreakdown = {
      creativity: clampNumber(existingTeam.round2_breakdown?.creativity, 0, 50, existingFallbackCriterion),
      accuracy: clampNumber(existingTeam.round2_breakdown?.accuracy, 0, 50, existingFallbackCriterion)
    };

    const hasRubricInput = [creativity, accuracy].some(value => value !== undefined);
    let nextBreakdown = { ...existingBreakdown };

    if (hasRubricInput) {
      if (creativity !== undefined) {
        nextBreakdown.creativity = clampNumber(creativity, 0, 50, existingBreakdown.creativity);
      }
      if (accuracy !== undefined) {
        nextBreakdown.accuracy = clampNumber(accuracy, 0, 50, existingBreakdown.accuracy);
      }
    } else if (round2_score !== undefined) {
      // Backward compatibility for old clients that still submit a single Round 2 score.
      const normalizedRound2Score = clampNumber(round2_score, 0, 100, 0);
      const criterionEquivalent = roundTo2(normalizedRound2Score / 2);
      nextBreakdown = {
        creativity: criterionEquivalent,
        accuracy: criterionEquivalent
      };
    } else {
      return res.status(400).json({ error: 'Provide rubric scores or round2_score.' });
    }

    const computedRound2Score = roundTo2(
      nextBreakdown.creativity + nextBreakdown.accuracy
    );

    const updatedTeam = await Team.findOneAndUpdate(
      { team_id },
      {
        $set: {
          round2_breakdown: nextBreakdown,
          round2_score: computedRound2Score
        }
      },
      { returnDocument: 'after' }
    );

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team: updatedTeam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

