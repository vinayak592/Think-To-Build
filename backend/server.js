const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const Pusher = require('pusher');
const cloudinary = require('cloudinary').v2;

const app = express();

// Pusher Setup (Real-time fallback for Vercel)
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

// Cloudinary Setup (Storage fallback for Vercel)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Attach cloud services to app so routes can access them
app.set('pusher', pusher);
app.set('cloudinary', cloudinary);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Main landing page (hub)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/main.html'));
});

// Team dashboard (competition page)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Registration page
app.get(['/api/register', '/register', '/RegistrationFolder'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public/RegistrationFolder/index.html'));
});

// Admin login & control panel
app.get(['/admin', '/AdminFolder'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Judge login page
app.get('/judge', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/judge-login.html'));
});

// Judge leaderboard dashboard (after login)
app.get(['/judge-dashboard', '/api/admin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public/judge.html'));
});

// MongoDB Connection (Only if not already connected - important for Serverless)
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
}

// Export for Vercel
module.exports = app;

// Local development server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Development server running at http://localhost:${PORT}`);
  });
}

