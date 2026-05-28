require('dotenv').config();
const mongoose = require('mongoose');
const Team = require('./models/Team');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 });
    const count = await Team.countDocuments();
    console.log('Actual DB count:', count);
    process.exit(0);
  } catch (e) {
    console.error('Error counting teams:', e);
    process.exit(1);
  }
})();
