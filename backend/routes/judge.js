const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Judge = require('../models/judge');
const Team = require('../models/Team'); // assuming existing Team model
const TeamScore = require('../models/teamScore');

// Middleware to verify JWT and attach judge info
function verifyJudge(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.judge = decoded; // contains id, email, round
    next();
  });
}

// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  try {
    const judge = await Judge.findOne({ email });
    if (!judge) return res.status(401).json({ message: 'Invalid credentials' });
    const valid = await judge.validatePassword(password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: judge._id, email: judge.email, round: judge.round, role: 'judge' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, round: judge.round });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get list of teams with scores/comments relevant to judge's round
router.get('/teams', verifyJudge, async (req, res) => {
  try {
    const teams = await Team.find();
    const scores = await TeamScore.find();
    const result = teams.map(team => {
      const scoreDoc = scores.find(s => s.teamId.toString() === team._id.toString()) || {};
      return {
        teamId: team._id,
        teamName: team.name,
        round1Score: scoreDoc.round1Score || 0,
        round2Score: scoreDoc.round2Score || 0,
        round1Comments: scoreDoc.round1Comments || [],
        totalScore: scoreDoc.totalScore || 0
      };
    });
    // Filter fields based on round
    const filtered = result.map(item => {
      if (req.judge.round === 1) {
        return {
          teamId: item.teamId,
          teamName: item.teamName,
          round1Score: item.round1Score,
          round1Comments: item.round1Comments
        };
      } else {
        return {
          teamId: item.teamId,
          teamName: item.teamName,
          round1Score: item.round1Score, // read‑only
          round2Score: item.round2Score,
          round1Comments: item.round1Comments,
          totalScore: item.totalScore
        };
      }
    });
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit or update score for a team (round‑specific)
router.post('/score', verifyJudge, async (req, res) => {
  const { teamId, score } = req.body;
  if (!teamId || typeof score !== 'number') return res.status(400).json({ message: 'teamId and numeric score required' });
  try {
    let doc = await TeamScore.findOne({ teamId });
    if (!doc) {
      doc = new TeamScore({ teamId });
    }
    if (req.judge.round === 1) {
      doc.round1Score = score;
    } else {
      doc.round2Score = score;
    }
    await doc.save();
    res.json({ message: 'Score saved', totalScore: doc.totalScore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment (only Round 1 judges)
router.post('/comment', verifyJudge, async (req, res) => {
  if (req.judge.round !== 1) return res.status(403).json({ message: 'Only Round 1 judges can add comments' });
  const { teamId, comment } = req.body;
  if (!teamId || !comment) return res.status(400).json({ message: 'teamId and comment required' });
  try {
    let doc = await TeamScore.findOne({ teamId });
    if (!doc) {
      doc = new TeamScore({ teamId });
    }
    doc.round1Comments.push(comment);
    await doc.save();
    res.json({ message: 'Comment added' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
