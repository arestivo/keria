// backend/server.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store active connections per session
// connections: Map<sessionId, { pool, username, createdAt, expiresAt }>
const connections = new Map();

// Session lifetime (ms)
const SESSION_TTL = 1000 * 60 * 60; // 1 hour

function isValidIdentifier(name) {
  return typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect endpoint
app.post('/api/connect', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username and password are required' 
    });
  }
  
  try {
    const pool = new Pool({
      host: 'postgres',
      port: 5432,
      database: username,
      user: username,
      password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await pool.connect();
    // enforce reasonable timeouts for student queries on this session
    await client.query('SET statement_timeout = 10000'); // 10s
    await client.query('SET idle_in_transaction_session_timeout = 20000');
    await client.query('SELECT NOW()');
    client.release();

    // Generate session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    connections.set(sessionId, { pool, username, createdAt: now, expiresAt: now + SESSION_TTL });

    res.json({ 
      success: true, 
      sessionId,
      message: 'Connected successfully' 
    });
  } catch (error) {
    console.error('Connection error:', error);
    res.status(400).json({ success: false, error: 'Connection failed' });
  }
});

// Disconnect endpoint
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body;
  const session = connections.get(sessionId);

  if (session && session.pool) {
    try { await session.pool.end(); } catch (e) { console.error('Error closing pool:', e); }
    connections.delete(sessionId);
  }

  res.json({ success: true });
});

// Get schemas
app.get('/api/schemas/:sessionId', async (req, res) => {
  const session = connections.get(req.params.sessionId);
  if (!session || !session.pool || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const result = await session.pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    
    res.json({ success: true, schemas: result.rows.map(r => r.schema_name) });
  } catch (error) {
    console.error('Get schemas error:', error);
    res.status(400).json({ success: false, error: 'Failed to fetch schemas' });
  }
});

// Get tables for a schema
app.get('/api/tables/:sessionId/:schemaName', async (req, res) => {
  const session = connections.get(req.params.sessionId);
  const { schemaName } = req.params;
  if (!session || !session.pool || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Not connected' });
  }

  if (!isValidIdentifier(schemaName)) {
    return res.status(400).json({ success: false, error: 'Invalid schema name' });
  }

  try {
    const result = await session.pool.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) 
         FROM information_schema.columns 
         WHERE table_schema = $1 AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = $1 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [schemaName]);
    
    res.json({ success: true, tables: result.rows });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(400).json({ success: false, error: 'Failed to fetch tables' });
  }
});

// Create schema
app.post('/api/schemas/:sessionId', async (req, res) => {
  const session = connections.get(req.params.sessionId);
  const { schemaName } = req.body;
  if (!session || !session.pool || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    // Sanitize schema name (only allow alphanumeric and underscore)
    if (!isValidIdentifier(schemaName)) {
      return res.status(400).json({ success: false, error: 'Invalid schema name. Use only letters, numbers, and underscores.' });
    }

    await session.pool.query(`CREATE SCHEMA "${schemaName}"`);
    
    res.json({ success: true, message: `Schema "${schemaName}" created` });
  } catch (error) {
    console.error('Create schema error:', error);
    res.status(400).json({ success: false, error: 'Failed to create schema' });
  }
});

// Delete schema
app.delete('/api/schemas/:sessionId/:schemaName', async (req, res) => {
  const session = connections.get(req.params.sessionId);
  const { schemaName } = req.params;
  if (!session || !session.pool || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    // Prevent deleting system schemas
    if (['public', 'pg_catalog', 'information_schema', 'pg_toast'].includes(schemaName)) {
      return res.status(400).json({ success: false, error: 'Cannot delete system schema' });
    }

    if (!isValidIdentifier(schemaName)) {
      return res.status(400).json({ success: false, error: 'Invalid schema name' });
    }

    await session.pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    
    res.json({ success: true, message: `Schema "${schemaName}" deleted` });
  } catch (error) {
    console.error('Delete schema error:', error);
    res.status(400).json({ success: false, error: 'Failed to delete schema' });
  }
});

// Execute query
app.post('/api/query/:sessionId', async (req, res) => {
  const session = connections.get(req.params.sessionId);
  const { query, schema } = req.body;

  if (!session || !session.pool || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Not connected' });
  }

  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Query cannot be empty' });
  }

  // Basic blacklist for potentially dangerous operations (best-effort)
  const dangerous = /(CREATE\s+FUNCTION|CREATE\s+EXTENSION|ALTER\s+SYSTEM|COPY\s+(TO|FROM)|\\\\.|pg_catalog|pg_read|pg_write)/i;
  if (dangerous.test(query)) {
    return res.status(400).json({ success: false, error: 'Query contains disallowed operations' });
  }

  if (schema && !isValidIdentifier(schema)) {
    return res.status(400).json({ success: false, error: 'Invalid schema name' });
  }

  const startTime = Date.now();
  const client = await session.pool.connect();

  try {
    // enforce per-connection timeouts (re-applied for each acquired client)
    await client.query('SET statement_timeout = 10000');
    await client.query('SET idle_in_transaction_session_timeout = 20000');

    // Set the search_path to the selected schema if provided
    if (schema) {
      await client.query(`SET search_path TO "${schema}", public`);
    }

    const result = await client.query(query);
    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      columns: result.fields ? result.fields.map(f => f.name) : [],
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime: `${executionTime}ms`,
      command: result.command
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(400).json({ success: false, error: 'Query failed' });
  } finally {
    client.release();
  }
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  for (const pool of connections.values()) {
    await pool.end();
  }
  process.exit();
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  for (const pool of connections.values()) {
    await pool.end();
  }
  process.exit();
});

app.listen(3000, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:3000`);
  console.log(`PostgreSQL Connection: postgres:5432`);
});

// Periodic sweeper to close expired sessions
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of connections.entries()) {
    if (session && session.expiresAt && session.expiresAt < now) {
      try {
        await session.pool.end();
      } catch (e) {
        console.error('Error ending expired pool:', e);
      }
      connections.delete(id);
      console.log('Expired session cleaned:', id);
    }
  }
}, 1000 * 60 * 5); // every 5 minutes