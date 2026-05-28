const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const rateLimit = require('express-rate-limit');
const Team = require('../models/Team');
const EventState = require('../models/EventState');
const { compareImages } = require('../services/clip');
const axios = require('axios');
const FormData = require('form-data');

// Get Hibiscus score from Flask microservice
async function getHibiscusScore(imagePath) {
  try {
    const form = new FormData();
    form.append('images', fs.createReadStream(imagePath));
    const response = await axios.post('http://127.0.0.1:5000/predict', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });
    if (response.data && response.data.results && response.data.results.length > 0) {
      return response.data.results[0].score;
    }
    return 0;
  } catch (err) {
    console.error('Hibiscus scoring failed:', err.message);
    return 0;
  }
}

// ===== RATE LIMITERS =====

// Strict: Auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
  skipSuccessfulRequests: true, // Only count failed requests against limit
});

// Moderate: Registration — 100 per hour per IP (temporarily increased for testing)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please wait an hour.' },
});

// Upload: 10 uploads per 10 min per IP (teams can upload up to 3 times)
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload attempts. Please wait a few minutes.' },
});

// General API: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Apply general limiter to all routes in this router
router.use(generalLimiter);

// ===== AUTH MIDDLEWARE =====

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

// ===== PUBLIC ROUTES =====

// Registration Status
router.get('/registration-status', async (req, res) => {
  try {
    const MAX_TEAMS = 50;
    const teamCount = await Team.countDocuments();
    const isOpen = teamCount < MAX_TEAMS;
    res.json({
      open: isOpen,
      teamCount,
      maxTeams: MAX_TEAMS,
      message: isOpen ? '' : 'Registration is closed. Maximum 50 teams allowed.'
    });
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

    const { email, team_name, participant_name, phone_number, member_count, members } = req.body;

    // Validate required fields
    if (!email || !team_name || !participant_name || !phone_number) {
      return res.status(400).json({ error: 'Email, Team Name, Participant Name, and Phone Number are required.' });
    }

    // Check for duplicate team name
    const existingTeamByName = await Team.findOne({ team_name });
    if (existingTeamByName) {
      return res.status(400).json({ error: 'Team name already registered.' });
    }
    // Check for duplicate participant name
    const existingTeamByParticipant = await Team.findOne({ participant_name });
    if (existingTeamByParticipant) {
      return res.status(400).json({ error: 'Participant name already registered.' });
    }
    // Check for duplicate phone number
    const existingTeamByPhone = await Team.findOne({ phone_number });
    if (existingTeamByPhone) {
      return res.status(400).json({ error: 'Phone number already registered.' });
    }
    // Check for duplicate email
    const existingTeamByEmail = await Team.findOne({ email });
    if (existingTeamByEmail) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    let team_id;
    let isUnique = false;
    while (!isUnique) {
      team_id = generateTeamId();
      const checkId = await Team.findOne({ team_id });
      if (!checkId) isUnique = true;
    }

    const team = new Team({ team_id, email, team_name, participant_name, phone_number });
    await team.save();

    // Issue JWT
    const token = jwt.sign({ team_id: team.team_id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '4h' });

    res.json({ success: true, team_id: team.team_id, token, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
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
router.post('/auth/admin', authLimiter, (req, res) => {
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
router.post('/auth/judge', authLimiter, (req, res) => {
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

// Warn and Disqualify on 3rd warning after max uploads used
router.post('/warn', authenticateToken, async (req, res) => {
  try {
    const team_id = req.user.team_id;
    const team = await Team.findOne({ team_id });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Increment warnings
    team.warnings = (team.warnings || 0) + 1;

    // Disqualify if 3 or more warnings and max upload attempts used
    if (team.warnings >= 3 && team.upload_attempts_used >= team.max_upload_attempts) {
      team.disqualified = true;
    }
    await team.save();

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team, warnings: team.warnings, disqualified: team.disqualified });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Opt-out of image uploads
router.post('/opt-out', authenticateToken, async (req, res) => {
  try {
    const team_id = req.user.team_id;
    const team = await Team.findOneAndUpdate(
      { team_id },
      {
        opted_out: true,
        opt_out_timestamp: new Date()
      },
      { returnDocument: 'after' }
    );

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear disqualification (admin only)
router.post('/admin/clear-disqualification', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) {
      return res.status(400).json({ error: 'Team ID is required.' });
    }

    const team = await Team.findOneAndUpdate(
      { team_id },
      { disqualified: false },
      { returnDocument: 'after' }
    );

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Qualify team (admin only)
router.post('/admin/qualify-team', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) {
      return res.status(400).json({ error: 'Team ID is required.' });
    }

    const team = await Team.findOneAndUpdate(
      { team_id },
      { qualified: true },
      { returnDocument: 'after' }
    );

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unqualify team (admin only)
router.post('/admin/unqualify-team', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) {
      return res.status(400).json({ error: 'Team ID is required.' });
    }

    const team = await Team.findOneAndUpdate(
      { team_id },
      { qualified: false },
      { returnDocument: 'after' }
    );

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TEAMS & ADMIN =====

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
    const teams = await Team.find().sort({ round1_score: -1 });
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

// ===== TEAM DETAILS & IMAGES =====

// Show team registration details
router.get('/team/:team_id/registration', async (req, res) => {
  try {
    const team = await Team.findOne({ team_id: req.params.team_id })
      .select('team_id team_name participant_name email round1_score disqualified qualified warnings upload_attempts_used');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Show the 3 images uploaded by a team
router.get('/team/:team_id/images', async (req, res) => {
  try {
    const team = await Team.findOne({ team_id: req.params.team_id })
      .select('round1_images');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ success: true, images: team.round1_images });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Self-disqualify (called by anti-cheat in team.js)
router.post('/disqualify', authenticateToken, async (req, res) => {
  try {
    const team_id = req.user.team_id;
    if (!team_id) return res.status(403).json({ error: 'Team token required.' });

    const team = await Team.findOneAndUpdate(
      { team_id },
      { disqualified: true, disqualified_at: new Date() },
      { returnDocument: 'after' }
    );

    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const io = req.app.get('io');
    if (io) io.emit('leaderboard_update');

    console.log(`[ANTI-CHEAT] Team ${team_id} self-disqualified.`);
    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
