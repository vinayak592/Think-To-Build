require('dotenv').config();
const express = require('express'); // trigger restart
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const EventState = require('./models/EventState');
const helmet = require('helmet');
const compression = require('compression');

// ===== PROCESS-LEVEL CRASH GUARDS =====
// Prevent a single uncaught error from taking down the whole process
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
  // Don't exit — keep server alive
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  // Don't exit — keep server alive
});

// ===== SPAWN PYTHON FLASK APP AUTOMATICALLY =====
const { spawn } = require('child_process');
const flaskAppDir  = path.resolve(__dirname, '../flask_app');
const flaskAppPath = path.join(flaskAppDir, 'app.py');
const pythonCmd = process.platform === 'win32'
  ? path.join(flaskAppDir, 'venv/Scripts/python.exe')
  : 'python3';

console.log(`[SERVER] Flask app dir : ${flaskAppDir}`);
console.log(`[SERVER] Python binary : ${pythonCmd}`);
console.log(`[SERVER] Spawning Flask service...`);

const pythonProcess = spawn(pythonCmd, [flaskAppPath], {
  cwd: flaskAppDir,
  stdio: 'inherit',
  shell: false,
  env: Object.assign({}, process.env, {
  PYTHONUNBUFFERED: '1',
  PORT: '5000'
})
});

pythonProcess.on('error', (err) => {
  console.error('[SERVER] [ERROR] Failed to start Python Flask app:', err.message);
});

pythonProcess.on('exit', (code, signal) => {
  if (code !== null) console.warn(`[SERVER] Flask exited with code ${code}`);
  if (signal)       console.warn(`[SERVER] Flask killed by signal ${signal}`);
});

process.on('exit', () => {
  if (pythonProcess && !pythonProcess.killed) {
    console.log('[SERVER] Terminating Python process...');
    pythonProcess.kill();
  }
});

const app = express();
app.get('/health', (req, res) => {
  console.log('HEALTH ROUTE HIT');
  res.send('OK');
});

app.get('/test', (req, res) => {
  console.log('TEST ROUTE HIT');
  res.send('Server is alive');
});

const server = http.createServer(app);

// ===== SOCKET.IO TUNING FOR CONCURRENT USERS =====
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,        // Wait 60s before declaring a client disconnected
  pingInterval: 25000,       // Ping every 25s
  maxHttpBufferSize: 1e6,    // 1MB max payload
  transports: ['websocket', 'polling'], // Prefer WebSocket
});

// ===== MIDDLEWARE =====

// Security headers (must come before other middleware)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to avoid breaking inline scripts
  crossOriginEmbedderPolicy: false,
}));

// GZIP compression for all responses (reduces bandwidth ~70%)
app.use(compression());

// CORS
app.use(cors());

// Body parsers with size limits to prevent memory attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROUTES =====
const apiRoutes = require('./routes/api');
const judgeRoutes = require('./routes/judge');
app.use('/api', apiRoutes);
app.use('/api/judge', judgeRoutes);

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/main.html')));
app.get('/portals', (req, res) => res.sendFile(path.join(__dirname, 'public/portals.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get(['/api/register', '/register', '/RegistrationFolder'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public/RegistrationFolder/index.html'))
);
app.get(['/admin', '/AdminFolder'], (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/judge', (req, res) => res.sendFile(path.join(__dirname, 'public/judge-login.html')));
app.get(['/judge-dashboard', '/api/admin'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public/judge.html'))
);

// ===== GLOBAL ERROR HANDLER =====
// Catches any error thrown from route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// 404 fallback
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ===== ENSURE UPLOAD DIRS =====
const generatedPath = path.join(__dirname, 'uploads/generated');
const referencePath = path.join(__dirname, 'uploads/reference');
if (!fs.existsSync(generatedPath)) fs.mkdirSync(generatedPath, { recursive: true });
if (!fs.existsSync(referencePath)) fs.mkdirSync(referencePath, { recursive: true });

// Attach io so routes can access it
app.set('io', io);

// ===== SOCKET.IO CONNECTION HANDLER =====
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id} | Total: ${io.engine.clientsCount}`);

  socket.on('error', (err) => {
    console.error(`[WS] Socket error (${socket.id}):`, err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[WS] Client disconnected: ${socket.id} | Reason: ${reason}`);
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3001; // Use env variable to avoid conflicts

// Set HTTP-level timeouts to prevent slow-client connection pile-up
server.timeout = 120000;         // 2 min max for any request
server.keepAliveTimeout = 65000; // Keep-alive slightly above load balancer timeout
server.headersTimeout = 66000;   // Must be > keepAliveTimeout

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  console.log("PORT ENV =", process.env.PORT);
  // -------------------
  // Automatic Event Start
  // -------------------
  const eventStartEnv = process.env.EVENT_START_TIME;
  if (eventStartEnv) {
    const startTime = new Date(eventStartEnv);
    const now = new Date();
    if (isNaN(startTime.getTime())) {
      console.warn('[SERVER] Invalid EVENT_START_TIME format');
    } else if (startTime > now) {
      const delayMs = startTime - now;
      console.log(`[SERVER] Event scheduled to start at ${startTime.toISOString()} (in ${(delayMs/1000/60).toFixed(2)} minutes)`);
      setTimeout(async () => {
        try {
          // Mimic /event/start logic (admin-only in API, but here we start as system)
          const state = await EventState.findOneAndUpdate(
            { key: 'main' },
            { event_started: true, started_at: new Date(), started_by: 'system' },
            { upsert: true, returnDocument: 'after' }
          );
          const io = app.get('io');
          if (io) io.emit('event_started');
          console.log('[SERVER] Automatic event start executed');
        } catch (err) {
          console.error('[SERVER] Automatic event start failed:', err.message);
        }
      }, delayMs);
    } else {
      console.log('[SERVER] EVENT_START_TIME is in the past – event should already be started.');
    }
  }
});

// ===== MONGODB CONNECTION with pool tuning =====
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/thinktobuild', {
  maxPoolSize: 20,                  // Up to 20 concurrent DB connections
  minPoolSize: 2,                   // Keep 2 warm connections ready
  serverSelectionTimeoutMS: 8000,   // Fail fast if DB unreachable (8s)
  socketTimeoutMS: 45000,           // Drop idle sockets after 45s
  connectTimeoutMS: 10000,          // Give 10s to initial connection
})
  .then(() => console.log('[DB] Connected to MongoDB'))
  .catch((err) => console.error('[DB] MongoDB connection error:', err.message));

// Seed default judges if not present
(async () => {
  const Judge = require('./models/judge');
  const bcrypt = require('bcryptjs');
  const judges = [
    { email: process.env.JUDGE1_EMAIL, password: process.env.JUDGE1_PASSWORD, round: 1 },
    { email: process.env.JUDGE2_EMAIL, password: process.env.JUDGE2_PASSWORD, round: 2 }
  ];
  for (const j of judges) {
    if (!j.email) continue;
    const exists = await Judge.findOne({ email: j.email });
    if (!exists) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(j.password, salt);
      await Judge.create({ email: j.email, passwordHash: hash, round: j.round });
      console.log(`[SEED] Created judge ${j.email} for round ${j.round}`);
    }
  }
})();

// Reconnect automatically on dropped connection
mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected. Attempting reconnect...');
});
mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected.');
});

// ===== GRACEFUL SHUTDOWN =====
// Allows in-flight requests to finish before closing on SIGTERM (Heroku/Railway deploys)
function gracefulShutdown(signal) {
  console.log(`[SERVER] ${signal} received. Shutting down gracefully...`);
  
  if (pythonProcess) {
    console.log('[SERVER] Killing Python Flask service...');
    pythonProcess.kill();
  }

  server.close(async () => {
    console.log('[SERVER] HTTP server closed.');
    try {
      await mongoose.connection.close();
      console.log('[DB] MongoDB connection closed.');
    } catch (e) {
      console.error('[DB] Error closing MongoDB:', e.message);
    }
    process.exit(0);
  });

  // Force exit after 15s if connections don't drain
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after timeout.');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
