const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  image_path: { type: String, required: true },
  clip_score: { type: Number, required: true },
  gemini_score: { type: Number, required: true },
  final_score: { type: Number, required: true },
  created_at: { type: Date, default: Date.now }
});

const teamSchema = new mongoose.Schema({
  team_id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  team_name: { type: String, required: true },
  participant_name: { type: String, required: true },
  disqualified: { type: Boolean, default: false },
  submissions: [submissionSchema],
  best_score: { type: Number, default: 0 },
  round2_score: { type: Number, default: 0 }
});

// Virtual for calculating the absolute final total
teamSchema.virtual('final_total_score').get(function() {
  return this.best_score + this.round2_score;
});

teamSchema.set('toJSON', { virtuals: true });
teamSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Team', teamSchema);
