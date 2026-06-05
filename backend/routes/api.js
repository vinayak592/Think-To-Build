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
const MAX_TEAMS = parseInt(process.env.MAX_TEAMS) || 50;
const multer = require('multer');

// ===== MULTER CONFIGURATION =====

// Storage for participant image uploads
const participantStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/generated');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const teamId = req.user ? req.user.team_id : 'unknown';
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${teamId}_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    cb(null, uniqueName);
  }
});

// Storage for admin target image upload
const targetStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/reference');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Always save as reference.jpg (overwrite previous)
    cb(null, 'reference.jpg');
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.'), false);
  }
};

const uploadParticipantImages = multer({
  storage: participantStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
}).array('images', 3);

const uploadTargetImage = multer({
  storage: targetStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).single('target');

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
    const teamCount = await Team.countDocuments();
    const isOpen = teamCount < MAX_TEAMS;
    res.json({
      open: isOpen,
      teamCount,
      maxTeams: MAX_TEAMS,
      message: isOpen ? '' : `Registration is closed. Maximum ${MAX_TEAMS} teams allowed.`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const teamCount = await Team.countDocuments();
    if (teamCount >= MAX_TEAMS) {
      return res.status(400).json({ error: `Registration is closed. Maximum ${MAX_TEAMS} teams allowed.` });
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

const activeUploads = new Set();

// Upload participant images and score with Hibiscus classifier
router.post('/upload-images', authenticateToken, uploadLimiter, (req, res) => {
  const team_id = req.user.team_id;
  if (!team_id) {
    return res.status(403).json({ error: 'Team token required.' });
  }

  if (activeUploads.has(team_id)) {
    return res.status(429).json({ error: 'An upload is already in progress. Please wait.' });
  }

  activeUploads.add(team_id);

  uploadParticipantImages(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        throw new Error(`Upload error: ${multerErr.message}`);
      }

      // Validate event state
      const eventState = await EventState.findOne({ key: 'main' });
      if (!eventState || !eventState.event_started) {
        // Clean up uploaded files
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        throw new Error('Event has not started yet.');
      }

      const team = await Team.findOne({ team_id });
      if (!team) {
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        throw new Error('Team not found.');
      }

      if (team.disqualified) {
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        throw new Error('Team has been disqualified.');
      }

      if (team.opted_out) {
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        throw new Error('Team has opted out of image uploads.');
      }

      if (team.upload_attempts_used >= team.max_upload_attempts) {
        if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
        throw new Error(`Maximum upload attempts (${team.max_upload_attempts}) already used.`);
      }

      if (!req.files || req.files.length === 0) {
        throw new Error('No images uploaded. Please select up to 3 images.');
      }

      // Limit uploads to not exceed 3 total
      const remainingSlots = 3 - team.round1_images.length;
      const filesToProcess = req.files.slice(0, remainingSlots);

      // Remove extra files if more were uploaded
      if (req.files.length > remainingSlots) {
        req.files.slice(remainingSlots).forEach(f => {
          try { fs.unlinkSync(f.path); } catch (e) { }
        });
      }

      // Score each image using Hibiscus classifier
      const results = [];
      for (const file of filesToProcess) {
        let score = 0;
        try {
          score = await getHibiscusScore(file.path);
          score = Math.max(0, Math.min(100, Number(score) || 0));
        } catch (err) {
          console.error(`Hibiscus scoring failed for ${file.filename}:`, err.message);
          score = 0; // Fallback
        }

        const imageEntry = {
          image_path: `/uploads/generated/${file.filename}`,
          score: roundTo2(score)
        };

        team.round1_images.push(imageEntry);
        results.push(imageEntry);
      }

      // Compute Round 1 score: best (max) of all image scores
      const allScores = team.round1_images.map(img => Number(img.score) || 0);
      const bestScore = allScores.length > 0 ? Math.max(...allScores) : 0;
      team.round1_score = roundTo2(bestScore);
      team.best_score = team.round1_score;

      // Increment upload attempt counter
      team.upload_attempts_used += 1;

      // Fix validation errors for legacy teams missing required fields
      if (!team.participant_name) team.participant_name = "Unknown Participant";
      if (!team.team_name) team.team_name = "Unknown Team";

      await team.save();

      const io = req.app.get('io');
      if (io) io.emit('leaderboard_update');

      res.json({
        success: true,
        images: results,
        round1_score: team.round1_score,
        total_images: team.round1_images.length
      });
    } catch (error) {
      console.error('Upload-images error:', error.message);
      res.status(500).json({ error: error.message });
    } finally {
      activeUploads.delete(team_id);
    }
  });
});

// ===== ADMIN: UPLOAD TARGET IMAGE =====
router.post('/admin/upload-target', authenticateToken, authorizeRoles('admin'), (req, res) => {
  uploadTargetImage(req, res, (multerErr) => {
    try {
      if (multerErr) {
        throw new Error(`Upload error: ${multerErr.message}`);
      }

      if (!req.file) {
        throw new Error('No target image uploaded.');
      }

      console.log(`Target image uploaded: ${req.file.path}`);
      res.json({
        success: true,
        message: 'Target image uploaded successfully.',
        path: `/uploads/reference/${req.file.filename}`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Admin/Judge Score Update
router.post('/admin/score', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const { team_id, round, round1_score, round2_score, innovation, implementation, creativity, accuracy } = req.body;

    if (!team_id) {
      return res.status(400).json({ error: 'team_id is required.' });
    }

    const existingTeam = await Team.findOne({ team_id });
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    // Determine target round: either explicitly passed, or inferred from judge token, or inferred from input fields
    let targetRound = round;
    if (req.user && req.user.role === 'judge') {
      targetRound = req.user.round;
    }
    if (!targetRound) {
      // Infer from input fields
      if (innovation !== undefined || implementation !== undefined || round1_score !== undefined) {
        targetRound = 1;
      } else {
        targetRound = 2;
      }
    }

    const updateFields = {};

    if (targetRound === 1) {
      const existingFallbackCriterion = clampNumber((existingTeam.round1_score || 0) / 2, 0, 50, 0);
      const existingBreakdown = {
        innovation: clampNumber(existingTeam.round1_breakdown?.innovation, 0, 50, existingFallbackCriterion),
        implementation: clampNumber(existingTeam.round1_breakdown?.implementation, 0, 50, existingFallbackCriterion)
      };

      const hasRubricInput = [innovation, implementation].some(value => value !== undefined);
      let nextBreakdown = { ...existingBreakdown };

      if (hasRubricInput) {
        if (innovation !== undefined) {
          nextBreakdown.innovation = clampNumber(innovation, 0, 50, existingBreakdown.innovation);
        }
        if (implementation !== undefined) {
          nextBreakdown.implementation = clampNumber(implementation, 0, 50, existingBreakdown.implementation);
        }
      } else if (round1_score !== undefined) {
        const normalizedScore = clampNumber(round1_score, 0, 100, 0);
        const criterionEquivalent = roundTo2(normalizedScore / 2);
        nextBreakdown = {
          innovation: criterionEquivalent,
          implementation: criterionEquivalent
        };
      }

      const computedRound1Score = roundTo2(nextBreakdown.innovation + nextBreakdown.implementation);
      updateFields.round1_breakdown = nextBreakdown;
      updateFields.round1_score = computedRound1Score;
      updateFields.best_score = computedRound1Score;
    } else {
      // Round 2
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
        const normalizedScore = clampNumber(round2_score, 0, 100, 0);
        const criterionEquivalent = roundTo2(normalizedScore / 2);
        nextBreakdown = {
          creativity: criterionEquivalent,
          accuracy: criterionEquivalent
        };
      }

      const computedRound2Score = roundTo2(nextBreakdown.creativity + nextBreakdown.accuracy);
      updateFields.round2_breakdown = nextBreakdown;
      updateFields.round2_score = computedRound2Score;
    }

    const updatedTeam = await Team.findOneAndUpdate(
      { team_id },
      { $set: updateFields },
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

// ===== ADMIN: UPLOAD TARGET IMAGE =====
router.post('/admin/upload-target', authenticateToken, authorizeRoles('admin'), (req, res) => {
  uploadTargetImage(req, res, (multerErr) => {
    try {
      if (multerErr) {
        throw new Error(`Upload error: ${multerErr.message}`);
      }

      if (!req.file) {
        throw new Error('No target image uploaded.');
      }

      console.log(`Target image uploaded: ${req.file.path}`);
      res.json({
        success: true,
        message: 'Target image uploaded successfully.',
        path: `/uploads/reference/${req.file.filename}`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Admin/Judge Score Update
router.post('/admin/score', authenticateToken, authorizeRoles('admin', 'judge'), async (req, res) => {
  try {
    const { team_id, round, round1_score, round2_score, innovation, implementation, creativity, accuracy } = req.body;

    if (!team_id) {
      return res.status(400).json({ error: 'team_id is required.' });
    }

    const existingTeam = await Team.findOne({ team_id });
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    // Determine target round: either explicitly passed, or inferred from judge token, or inferred from input fields
    let targetRound = round;
    if (req.user && req.user.role === 'judge') {
      targetRound = req.user.round;
    }
    if (!targetRound) {
      // Infer from input fields
      if (innovation !== undefined || implementation !== undefined || round1_score !== undefined) {
        targetRound = 1;
      } else {
        targetRound = 2;
      }
    }

    const updateFields = {};

    if (targetRound === 1) {
      const existingFallbackCriterion = clampNumber((existingTeam.round1_score || 0) / 2, 0, 50, 0);
      const existingBreakdown = {
        innovation: clampNumber(existingTeam.round1_breakdown?.innovation, 0, 50, existingFallbackCriterion),
        implementation: clampNumber(existingTeam.round1_breakdown?.implementation, 0, 50, existingFallbackCriterion)
      };

      const hasRubricInput = [innovation, implementation].some(value => value !== undefined);
      let nextBreakdown = { ...existingBreakdown };

      if (hasRubricInput) {
        if (innovation !== undefined) {
          nextBreakdown.innovation = clampNumber(innovation, 0, 50, existingBreakdown.innovation);
        }
        if (implementation !== undefined) {
          nextBreakdown.implementation = clampNumber(implementation, 0, 50, existingBreakdown.implementation);
        }
      } else if (round1_score !== undefined) {
        const normalizedScore = clampNumber(round1_score, 0, 100, 0);
        const criterionEquivalent = roundTo2(normalizedScore / 2);
        nextBreakdown = {
          innovation: criterionEquivalent,
          implementation: criterionEquivalent
        };
      }

      const computedRound1Score = roundTo2(nextBreakdown.innovation + nextBreakdown.implementation);
      updateFields.round1_breakdown = nextBreakdown;
      updateFields.round1_score = computedRound1Score;
      updateFields.best_score = computedRound1Score;
    } else {
      // Round 2
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
        const normalizedScore = clampNumber(round2_score, 0, 100, 0);
        const criterionEquivalent = roundTo2(normalizedScore / 2);
        nextBreakdown = {
          creativity: criterionEquivalent,
          accuracy: criterionEquivalent
        };
      }

      const computedRound2Score = roundTo2(nextBreakdown.creativity + nextBreakdown.accuracy);
      updateFields.round2_breakdown = nextBreakdown;
      updateFields.round2_score = computedRound2Score;
    }

    const updatedTeam = await Team.findOneAndUpdate(
      { team_id },
      { $set: updateFields },
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



// Self-disqualify (called by anti-cheat in team.js)


// Excel export of leaderboard with proper columns
router.get('/leaderboard/excel', async (req, res) => {
  try {
// Fetch teams with email
    const teams = await Team.find()
      .select('team_name participant_name email round1_score')
      .sort({ round1_score: -1 })
      .lean();
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leaderboard');
    // Define columns
    worksheet.columns = [
      { header: 'Team Name', key: 'team_name', width: 30 },
      { header: 'Participant', key: 'participant_name', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Score', key: 'round1_score', width: 15 }
    ];
    // Add rows
    teams.forEach(t => {
      worksheet.addRow({
        team_name: t.team_name || '-',
        participant_name: t.participant_name || '-',
        email: t.email || '-',
        round1_score: t.round1_score != null ? t.round1_score : '-'
      });
    });
    // Styling (bold header)
    worksheet.getRow(1).font = { bold: true };
    // Send as attachment
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      'attachment; filename="leaderboard.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Excel] Error generating leaderboard Excel:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
