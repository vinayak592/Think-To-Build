const mongoose = require('mongoose');
require('dotenv').config();
const Team = require('./models/Team');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/thinktobuild', {
      maxPoolSize: 10,
    });
    const result = await Team.deleteMany({});
    console.log('Deleted', result.deletedCount, 'team(s)');
    process.exit(0);
  } catch (e) {
    console.error('Error clearing teams:', e);
    process.exit(1);
  }
})();
