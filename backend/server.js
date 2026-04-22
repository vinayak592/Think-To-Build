require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Main landing page (hub)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/main.html'));
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Ensure upload directories exist
const generatedPath = path.join(__dirname, 'uploads/generated');
const referencePath = path.join(__dirname, 'uploads/reference');
if (!fs.existsSync(generatedPath)) fs.mkdirSync(generatedPath, { recursive: true });
if (!fs.existsSync(referencePath)) fs.mkdirSync(referencePath, { recursive: true });

// Attach io to app so routes can access it
app.set('io', io);

// Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Socket.io for real-time leaderboard
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion')
  .then(() => {
    console.log('Connected to MongoDB');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Web interface available at http://localhost:${PORT}`);
      console.log(`register API endpoint available at http://localhost:${PORT}/api/register`);
      console.log(`admin API endpoint available at http://localhost:${PORT}/api/admin`);
      console.log(`team ID list available at http://localhost:${PORT}/teams`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));
