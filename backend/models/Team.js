const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  image_path: { type: String, required: true },
  clip_score: { type: Number, required: true },
  gemini_score: { type: Number, required: true },
  final_score: { type: Number, required: true },
  created_at: { type: Date, default: Date.now }
});

const round1ImageSchema = new mongoose.Schema({
  image_path: { type: String, required: true },
  score: { type: Number, default: 0 },
  uploaded_at: { type: Date, default: Date.now }
});

const teamSchema = new mongoose.Schema({
  team_id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  team_name: { type: String, required: true },
  participant_name: { type: String, required: true },
  disqualified: { type: Boolean, default: false },
  warnings: { type: Number, default: 0 },
  submissions: [submissionSchema],
  best_score: { type: Number, default: 0 },
  // Upload attempt tracking
  upload_attempts_used: { type: Number, default: 0 },
  max_upload_attempts: { type: Number, default: 3 },
  opted_out: { type: Boolean, default: false },
  opt_out_timestamp: { type: Date, default: null },
  // Round 1: CLIP image similarity scoring
  round1_images: [round1ImageSchema],
  round1_score: { type: Number, default: 0 },
  round2_breakdown: {
    creativity: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 }
  },
  round2_score: { type: Number, default: 0 }
});

// Virtual for calculating the absolute final total
teamSchema.virtual('final_total_score').get(function() {
  return this.round1_score + this.round2_score;
});

// Virtual for calculating remaining upload attempts
teamSchema.virtual('remaining_upload_attempts').get(function() {
  if (this.opted_out) return 0;
  return Math.max(0, this.max_upload_attempts - this.upload_attempts_used);
});

teamSchema.set('toJSON', { virtuals: true });
teamSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Team', teamSchema);
