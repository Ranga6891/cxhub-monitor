const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize SQLite database
const db = new Database('./data/monitoring.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    port INTEGER,
    health_url TEXT,
    check_interval INTEGER DEFAULT 60,
    response_threshold INTEGER DEFAULT 4000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    check_type TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_checks_app_time ON checks(application_id, checked_at DESC);
`);

app.use(cors());
app.use(express.json());

// Health check for the monitoring app itself
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get all servers with their applications
app.get('/api/servers', (req, res) => {
  const servers = db.prepare(`
    SELECT s.*, 
           COUNT(DISTINCT a.id) as app_count
    FROM servers s
    LEFT JOIN applications a ON s.id = a.server_id
    GROUP BY s.id
    ORDER BY s.name
  `).all();

  res.json(servers);
});

// Get single server with applications
app.get('/api/servers/:id', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const applications = db.prepare(`
    SELECT a.*,
           (SELECT status FROM checks WHERE application_id = a.id ORDER BY checked_at DESC LIMIT 1) as last_status,
           (SELECT checked_at FROM checks WHERE application_id = a.id ORDER BY checked_at DESC LIMIT 1) as last_check
    FROM applications a
    WHERE a.server_id = ?
    ORDER BY a.name
  `).all(req.params.id);

  res.json({ ...server, applications });
});

// Create server
app.post('/api/servers', (req, res) => {
  const { name, host } = req.body;
  
  if (!name || !host) {
    return res.status(400).json({ error: 'Name and host are required' });
  }

  const result = db.prepare('INSERT INTO servers (name, host) VALUES (?, ?)').run(name, host);
  
  res.json({ id: result.lastInsertRowid, name, host });
});

// Update server
app.put('/api/servers/:id', (req, res) => {
  const { name, host } = req.body;
  
  db.prepare('UPDATE servers SET name = ?, host = ? WHERE id = ?').run(name, host, req.params.id);
  
  res.json({ id: req.params.id, name, host });
});

// Delete server
app.delete('/api/servers/:id', (req, res) => {
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Create application
app.post('/api/applications', (req, res) => {
  const { server_id, name, port, health_url, check_interval, response_threshold } = req.body;

  if (!server_id || !name) {
    return res.status(400).json({ error: 'Server ID and name are required' });
  }

  const result = db.prepare(`
    INSERT INTO applications (server_id, name, port, health_url, check_interval, response_threshold)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(server_id, name, port || null, health_url || null, check_interval || 60, response_threshold || 4000);

  res.json({
    id: result.lastInsertRowid,
    server_id,
    name,
    port,
    health_url,
    check_interval,
    response_threshold
  });
});

// Update application
app.put('/api/applications/:id', (req, res) => {
  const { name, port, health_url, check_interval, response_threshold } = req.body;

  db.prepare(`
    UPDATE applications
    SET name = ?, port = ?, health_url = ?, check_interval = ?, response_threshold = ?
    WHERE id = ?
  `).run(name, port || null, health_url || null, check_interval || 60, response_threshold || 4000, req.params.id);

  res.json({ id: req.params.id, name, port, health_url, check_interval, response_threshold });
});

// Delete application
app.delete('/api/applications/:id', (req, res) => {
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get check history for an application
app.get('/api/applications/:id/checks', (req, res) => {
  const limit = req.query.limit || 50;
  
  const checks = db.prepare(`
    SELECT * FROM checks 
    WHERE application_id = ?
    ORDER BY checked_at DESC
    LIMIT ?
  `).all(req.params.id, limit);
  
  res.json(checks);
});

// Get dashboard summary
app.get('/api/dashboard', (req, res) => {
  const summary = db.prepare(`
    SELECT 
      COUNT(DISTINCT s.id) as total_servers,
      COUNT(DISTINCT a.id) as total_applications,
      COUNT(DISTINCT CASE WHEN latest.status = 'up' THEN a.id END) as healthy_apps,
      COUNT(DISTINCT CASE WHEN latest.status = 'down' THEN a.id END) as down_apps
    FROM servers s
    LEFT JOIN applications a ON s.id = a.server_id
    LEFT JOIN (
      SELECT application_id, status, 
             ROW_NUMBER() OVER (PARTITION BY application_id ORDER BY checked_at DESC) as rn
      FROM checks
    ) latest ON a.id = latest.application_id AND latest.rn = 1
  `).get();

  const recentChecks = db.prepare(`
    SELECT c.*, a.name as app_name, s.name as server_name, s.host
    FROM checks c
    JOIN applications a ON c.application_id = a.id
    JOIN servers s ON a.server_id = s.id
    ORDER BY c.checked_at DESC
    LIMIT 20
  `).all();

  res.json({ summary, recentChecks });
});

// Manual check trigger
app.post('/api/applications/:id/check', async (req, res) => {
  const app = db.prepare(`
    SELECT a.*, s.host 
    FROM applications a
    JOIN servers s ON a.server_id = s.id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!app) {
    return res.status(404).json({ error: 'Application not found' });
  }

  const results = await performChecks(app);
  res.json(results);
});

// Monitoring functions
async function checkPort(host, port, timeout = 5000) {
  const start = Date.now();
  
  try {
    const cmd = `nc -z -w ${timeout / 1000} ${host} ${port}`;
    await execPromise(cmd);
    
    return {
      status: 'up',
      response_time: Date.now() - start,
      error_message: null
    };
  } catch (error) {
    return {
      status: 'down',
      response_time: Date.now() - start,
      error_message: `Port ${port} unreachable: ${error.message}`
    };
  }
}

async function checkHealthEndpoint(url, timeout = 5000) {
  const start = Date.now();
  
  try {
    const response = await axios.get(url, { 
      timeout,
      validateStatus: (status) => status === 200
    });
    
    return {
      status: 'up',
      response_time: Date.now() - start,
      error_message: null
    };
  } catch (error) {
    const responseTime = Date.now() - start;
    
    if (error.response) {
      return {
        status: 'down',
        response_time: responseTime,
        error_message: `HTTP ${error.response.status}: Expected 200`
      };
    }
    
    return {
      status: 'down',
      response_time: responseTime,
      error_message: error.message
    };
  }
}

async function performChecks(app) {
  const results = [];

  // Port check
  if (app.port) {
    const portResult = await checkPort(app.host, app.port);
    
    db.prepare(`
      INSERT INTO checks (application_id, check_type, status, response_time, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(app.id, 'port', portResult.status, portResult.response_time, portResult.error_message);
    
    results.push({ type: 'port', ...portResult });
  }

  // Health check
  if (app.health_url) {
    const healthResult = await checkHealthEndpoint(app.health_url);
    
    db.prepare(`
      INSERT INTO checks (application_id, check_type, status, response_time, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(app.id, 'health', healthResult.status, healthResult.response_time, healthResult.error_message);
    
    results.push({ type: 'health', ...healthResult });
  }

  return results;
}

// Run checks for all applications in parallel
async function runAllChecks() {
  console.log('[MONITOR] Running scheduled checks...');
  const startTime = Date.now();

  const applications = db.prepare(`
    SELECT a.*, s.host
    FROM applications a
    JOIN servers s ON a.server_id = s.id
  `).all();

  const checkPromises = applications.map(app =>
    performChecks(app).catch(error => {
      console.error(`[MONITOR] Error checking app ${app.name}:`, error.message);
      return null;
    })
  );

  await Promise.allSettled(checkPromises);

  const duration = Date.now() - startTime;
  console.log(`[MONITOR] Completed checks for ${applications.length} applications in ${duration}ms`);
}

// Dynamic scheduler that respects individual app intervals
let lastCheckTime = {};

setInterval(() => {
  const applications = db.prepare(`
    SELECT a.*, s.host
    FROM applications a
    JOIN servers s ON a.server_id = s.id
  `).all();

  const now = Date.now();
  const checksToRun = [];

  for (const app of applications) {
    const lastCheck = lastCheckTime[app.id] || 0;
    const interval = (app.check_interval || 60) * 1000;

    if (now - lastCheck >= interval) {
      checksToRun.push(app);
      lastCheckTime[app.id] = now;
    }
  }

  if (checksToRun.length > 0) {
    console.log(`[MONITOR] Running ${checksToRun.length} scheduled checks...`);
    const checkPromises = checksToRun.map(app =>
      performChecks(app).catch(error => {
        console.error(`[MONITOR] Error checking app ${app.name}:`, error.message);
        return null;
      })
    );
    Promise.allSettled(checkPromises);
  }
}, 5000);

// Cleanup old checks (keep last 1000 per application)
cron.schedule('0 * * * *', () => {
  console.log('[CLEANUP] Removing old check records...');
  
  db.exec(`
    DELETE FROM checks
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY application_id ORDER BY checked_at DESC) as rn
        FROM checks
      ) WHERE rn <= 1000
    )
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Monitoring backend running on port ${PORT}`);
  console.log('[MONITOR] Starting initial check...');
  runAllChecks();
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
