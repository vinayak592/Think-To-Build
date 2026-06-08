require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    // Mask password in URI for logging
    const uri = process.env.MONGODB_URI;
    console.log('[DB URI]', uri.replace(/:[^:@]+@/, ':****@'));
    let hostname = 'unknown';
    try {
      hostname = new URL(uri).hostname;
    } catch (e) {
      const match = uri.match(/@([^/?#]+)/);
      if (match) {
        hostname = match[1].split(',')[0].split(':')[0];
      }
    }
    console.log('[DB HOST]', hostname);

    // Connect using Mongoose v8 default options
    await mongoose.connect(uri);

    console.log('✅ MongoDB Connected Successfully');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);

    // Populate missing participant_name from email (use prefix before @)
    const Team = require('./models/Team');
    const teams = await Team.find({ $or: [{ participant_name: { $exists: false } }, { participant_name: null }, { participant_name: '' }] });
    for (const t of teams) {
      const email = t.email || '';
      const nameFromEmail = email.split('@')[0] || 'Unknown';
      t.participant_name = nameFromEmail;
      await t.save();
      console.log(`[DB] Updated participant_name for ${t.team_id} to ${nameFromEmail}`);
    }

    // Graceful disconnect
    await mongoose.disconnect();
    console.log('[DB] Disconnected gracefully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection Failed');
    console.error(err.stack || err);
    process.exit(1);
  }
})();
