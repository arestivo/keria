// backend/server.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store active connections per session
const connections = new Map();

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
    await client.query('SELECT NOW()');
    client.release();

    // Generate session ID
    const sessionId = Math.random().toString(36).substring(7) + Date.now();
    connections.set(sessionId, pool);

    res.json({ 
      success: true, 
      sessionId,
      message: 'Connected successfully' 
    });
  } catch (error) {
    console.error('Connection error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Disconnect endpoint
app.post('/api/disconnect', async (req, res) => {
  const { sessionId } = req.body;
  const pool = connections.get(sessionId);
  
  if (pool) {
    await pool.end();
    connections.delete(sessionId);
  }
  
  res.json({ success: true });
});

// Get schemas
app.get('/api/schemas/:sessionId', async (req, res) => {
  const pool = connections.get(req.params.sessionId);
  
  if (!pool) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const result = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    
    res.json({ 
      success: true, 
      schemas: result.rows.map(r => r.schema_name) 
    });
  } catch (error) {
    console.error('Get schemas error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get tables for a schema
app.get('/api/tables/:sessionId/:schemaName', async (req, res) => {
  const pool = connections.get(req.params.sessionId);
  const { schemaName } = req.params;
  
  if (!pool) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const result = await pool.query(`
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
    
    res.json({ 
      success: true, 
      tables: result.rows 
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create schema
app.post('/api/schemas/:sessionId', async (req, res) => {
  const pool = connections.get(req.params.sessionId);
  const { schemaName } = req.body;
  
  if (!pool) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    // Sanitize schema name (only allow alphanumeric and underscore)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new Error('Invalid schema name. Use only letters, numbers, and underscores.');
    }

    // Use parameterized query with identifier
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    
    res.json({ 
      success: true, 
      message: `Schema "${schemaName}" created` 
    });
  } catch (error) {
    console.error('Create schema error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete schema
app.delete('/api/schemas/:sessionId/:schemaName', async (req, res) => {
  const pool = connections.get(req.params.sessionId);
  const { schemaName } = req.params;
  
  if (!pool) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    // Prevent deleting system schemas
    if (['public', 'pg_catalog', 'information_schema', 'pg_toast'].includes(schemaName)) {
      throw new Error('Cannot delete system schema');
    }

    await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    
    res.json({ 
      success: true, 
      message: `Schema "${schemaName}" deleted` 
    });
  } catch (error) {
    console.error('Delete schema error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Execute query
app.post('/api/query/:sessionId', async (req, res) => {
  const pool = connections.get(req.params.sessionId);
  const { query, schema } = req.body;
  
  if (!pool) {
    return res.status(401).json({ error: 'Not connected' });
  }

  if (!query || !query.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Query cannot be empty' 
    });
  }

  const startTime = Date.now();
  const client = await pool.connect();
  
  try {
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
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
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