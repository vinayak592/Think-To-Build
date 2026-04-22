const mongoose = require('mongoose');

const eventStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main' },
  event_started: { type: Boolean, default: false },
  started_at: { type: Date, default: null },
  started_by: { type: String, default: null }
});

module.exports = mongoose.model('EventState', eventStateSchema);
