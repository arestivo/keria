// API URL - relative path since we're serving from same server
const API_URL = 'api';
let sessionId = null;

// State
let state = {
  connected: false,
  credentials: {},
  schemas: [],
  selectedSchema: 'public',
  tables: []
};

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newSchemaName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreateSchema();
  });
  
  // Add Enter key support for login fields
  document.getElementById('username').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
  
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
});

// Connection handling
async function handleConnect() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showLoginMessage('Please fill in username and password', 'error');
    return;
  }

  const btn = document.getElementById('connectBtn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      sessionId = data.sessionId;
      state.connected = true;
      state.credentials = { username };
      
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainInterface').classList.remove('hidden');
      document.getElementById('connectionInfo').textContent = 
        `${username}@postgres/${username}`;
      
      await loadSchemas();
      showMessage('Connected successfully!', 'success');
    } else {
      showLoginMessage(data.error || 'Connection failed', 'error');
    }
  } catch (error) {
    console.error('Connection error:', error);
    showLoginMessage('Connection failed: ' + error.message, 'error');
  } finally {
    btn.textContent = 'Connect';
    btn.disabled = false;
  }
}

async function handleDisconnect() {
  if (sessionId) {
    try {
      await fetch(`${API_URL}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }
  
  sessionId = null;
  state.connected = false;
  state.schemas = [];
  state.selectedSchema = 'public';
  
  document.getElementById('mainInterface').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('resultsContainer').classList.add('hidden');
  document.getElementById('queryEditor').value = '';
  document.getElementById('password').value = '';
}

function showLoginMessage(text, type) {
  const msgEl = document.getElementById('loginMessage');
  msgEl.className = `mt-4 p-3 rounded-md flex items-center gap-2 ${
    type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
  }`;
  msgEl.textContent = text;
  msgEl.classList.remove('hidden');
  
  setTimeout(() => {
    msgEl.classList.add('hidden');
  }, 5000);
}

// Schema management
async function loadSchemas() {
  try {
    const response = await fetch(`${API_URL}/schemas/${sessionId}`);
    const data = await response.json();
    
    if (data.success) {
      state.schemas = data.schemas;
      renderSchemas();
      await loadTables(); // Load tables for current schema
    } else {
      showMessage('Failed to load schemas: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Load schemas error:', error);
    showMessage('Failed to load schemas: ' + error.message, 'error');
  }
}

// Load tables for current schema
async function loadTables() {
  try {
    const response = await fetch(`${API_URL}/tables/${sessionId}/${state.selectedSchema}`);
    const data = await response.json();
    
    if (data.success) {
      state.tables = data.tables;
      renderTables();
    } else {
      showMessage('Failed to load tables: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Load tables error:', error);
    showMessage('Failed to load tables: ' + error.message, 'error');
  }
}

function renderTables() {
  const list = document.getElementById('tablesList');
  
  if (state.tables.length === 0) {
    list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No tables</p>';
    return;
  }

  list.innerHTML = state.tables.map(table => `
    <button onclick="selectTable('${table.table_name}')"
      class="w-full text-left text-xs px-3 py-2 bg-gray-50 hover:bg-indigo-50 rounded-md transition flex items-center justify-between group">
      <span class="font-medium text-gray-700">${table.table_name}</span>
      <span class="text-gray-400 text-xs">${table.column_count} cols</span>
    </button>
  `).join('');
}

async function selectTable(tableName) {
  const query = `SELECT * FROM ${state.selectedSchema}.${tableName} LIMIT 100;`;
  
  // Execute the query automatically without changing the editor
  await executeQueryDirect(query);
}

// Helper function to execute a query without button interaction
async function executeQueryDirect(queryText) {
  const btn = document.getElementById('executeBtn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = 'Executing...';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/query/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, schema: state.selectedSchema })
    });

    const data = await response.json();

    if (data.success) {
      if (data.rows && data.rows.length > 0) {
        displayResults(data);
      } else {
        document.getElementById('resultsContainer').classList.add('hidden');
        showMessage(`${data.command} completed successfully. ${data.rowCount} row(s) affected. Time: ${data.executionTime}`, 'success');
      }
      // Reload tables after query execution (in case tables were created/modified)
      await loadTables();
    } else {
      showMessage('Query error: ' + data.error, 'error');
      document.getElementById('resultsContainer').classList.add('hidden');
    }
  } catch (error) {
    console.error('Execute query error:', error);
    showMessage('Failed to execute query: ' + error.message, 'error');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

async function handleCreateSchema() {
  const input = document.getElementById('newSchemaName');
  const name = input.value.trim();

  if (!name) {
    showMessage('Schema name cannot be empty', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/schemas/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaName: name })
    });

    const data = await response.json();

    if (data.success) {
      input.value = '';
      await loadSchemas();
      selectSchema(name);
      showMessage(data.message, 'success');
    } else {
      showMessage(data.error || 'Failed to create schema', 'error');
    }
  } catch (error) {
    console.error('Create schema error:', error);
    showMessage('Failed to create schema: ' + error.message, 'error');
  }
}

async function handleDeleteSchema(schema) {
  if (!confirm(`Delete schema "${schema}"? This will delete all tables and data. This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/schemas/${sessionId}/${schema}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      await loadSchemas();
      if (state.selectedSchema === schema) {
        selectSchema('public');
      }
      showMessage(data.message, 'success');
    } else {
      showMessage(data.error || 'Failed to delete schema', 'error');
    }
  } catch (error) {
    console.error('Delete schema error:', error);
    showMessage('Failed to delete schema: ' + error.message, 'error');
  }
}

function renderSchemas() {
  const list = document.getElementById('schemaList');
  list.innerHTML = state.schemas.map(schema => `
    <div class="schema-item flex items-center justify-between p-2 rounded-md cursor-pointer transition ${
      state.selectedSchema === schema
        ? 'bg-indigo-50 border-2 border-indigo-500'
        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
    }" onclick="selectSchema('${schema}')">
      <span class="text-sm font-medium">${schema}</span>
      ${!['public', 'pg_catalog', 'information_schema'].includes(schema) ? `
        <button onclick="event.stopPropagation(); handleDeleteSchema('${schema}')"
          class="p-1 text-red-600 hover:bg-red-50 rounded text-xl leading-none" title="Delete schema">
          ×
        </button>
      ` : ''}
    </div>
  `).join('');
}

function selectSchema(schema) {
  state.selectedSchema = schema;
  document.getElementById('currentSchema').textContent = schema;
  renderSchemas();
  loadTables(); // Reload tables when schema changes
}

function clearQuery() {
  document.getElementById('queryEditor').value = '';
}

// Query execution
async function handleExecuteQuery() {
  const query = document.getElementById('queryEditor').value.trim();

  if (!query) {
    showMessage('Query cannot be empty', 'error');
    return;
  }

  const btn = document.getElementById('executeBtn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = 'Executing...';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/query/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, schema: state.selectedSchema })
    });

    const data = await response.json();

    if (data.success) {
      if (data.rows && data.rows.length > 0) {
        displayResults(data);
      } else {
        document.getElementById('resultsContainer').classList.add('hidden');
        showMessage(`${data.command} completed successfully. ${data.rowCount} row(s) affected. Time: ${data.executionTime}`, 'success');
      }
      // Reload tables after query execution (in case tables were created/modified)
      await loadTables();
    } else {
      showMessage('Query error: ' + data.error, 'error');
      document.getElementById('resultsContainer').classList.add('hidden');
    }
  } catch (error) {
    console.error('Execute query error:', error);
    showMessage('Failed to execute query: ' + error.message, 'error');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

function displayResults(data) {
  const container = document.getElementById('resultsContainer');
  const table = document.getElementById('resultsTable');
  const info = document.getElementById('resultsInfo');

  info.textContent = `${data.rowCount} rows • ${data.executionTime}`;

  let html = '<thead><tr class="bg-gray-50 border-b">';
  data.columns.forEach(col => {
    html += `<th class="px-4 py-3 text-left font-semibold text-gray-700">${escapeHtml(col)}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.rows.forEach(row => {
    html += '<tr class="border-b hover:bg-gray-50">';
    data.columns.forEach(col => {
      const value = row[col];
      html += `<td class="px-4 py-3 text-gray-600">${
        value !== null && value !== undefined 
          ? escapeHtml(String(value)) 
          : '<i class="text-gray-400">NULL</i>'
      }</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  table.innerHTML = html;
  container.classList.remove('hidden');
}

// Message handling
function showMessage(text, type) {
  const banner = document.getElementById('messageBanner');
  banner.className = `mb-4 p-4 rounded-lg flex items-center gap-2 ${
    type === 'error' 
      ? 'bg-red-50 text-red-700 border border-red-200' 
      : 'bg-green-50 text-green-700 border border-green-200'
  }`;
  banner.textContent = text;
  banner.classList.remove('hidden');

  setTimeout(() => {
    banner.classList.add('hidden');
  }, 5000);
}

// Utility function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}