const mongoose = require('mongoose');

const TeamScoreSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
  round1Score: { type: Number, default: 0, min: 0 },
  round2Score: { type: Number, default: 0, min: 0 },
  round1Comments: { type: [String], default: [] },
  totalScore: { type: Number, default: 0 }
});

// Compute totalScore capped at 200 before save
TeamScoreSchema.pre('save', function (next) {
  const sum = (this.round1Score || 0) + (this.round2Score || 0);
  this.totalScore = Math.min(sum, 200);
  next();
});

module.exports = mongoose.model('TeamScore', TeamScoreSchema);
