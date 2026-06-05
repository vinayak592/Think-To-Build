const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const JudgeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  round: { type: Number, enum: [1, 2], required: true },
  role: { type: String, default: 'judge' }
});

// Helper to set password
JudgeSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
};

// Verify password
JudgeSchema.methods.validatePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model('Judge', JudgeSchema);
