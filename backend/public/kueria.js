// === Constants ===
const API_URL = 'api';
let sessionId = null;

// === State ===
const state = {
  connected: false,
  credentials: {},
  schemas: [],
  selectedSchema: 'public',
  tables: []
};

// === DOM Cache ===
const DOM = {
  loginScreen: document.getElementById('loginScreen'),
  mainInterface: document.getElementById('mainInterface'),
  resultsContainer: document.getElementById('resultsContainer'),
  connectionInfo: document.getElementById('connectionInfo'),
  queryEditor: document.getElementById('queryEditor'),
  executeBtn: document.getElementById('executeBtn'),
  toggleBtn: document.getElementById('toggleMaximizeBtn'),
  maximizeIcon: document.getElementById('maximizeIcon'),
  topbar: document.getElementById('topbar'),
  messageBanner: document.getElementById('messageBanner'),
  loginMessage: document.getElementById('loginMessage'),
  schemaList: document.getElementById('schemaList'),
  tablesList: document.getElementById('tablesList'),
  currentSchema: document.getElementById('currentSchema'),
  resultsTable: document.getElementById('resultsTable'),
  resultsInfo: document.getElementById('resultsInfo'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  connectBtn: document.getElementById('connectBtn'),
  newSchemaName: document.getElementById('newSchemaName')
};

// === Utility Helpers ===
const UI = {
  showMessage(text, type, target = DOM.messageBanner) {
    target.className = `mb-4 p-4 rounded-lg flex items-center gap-2 ${
      type === 'error'
        ? 'bg-red-50 text-red-700 border border-red-200'
        : 'bg-green-50 text-green-700 border border-green-200'
    }`;
    target.textContent = text;
    target.classList.remove('hidden');
    setTimeout(() => target.classList.add('hidden'), 5000);
  },

  showLoginMessage(text, type) {
    this.showMessage(text, type, DOM.loginMessage);
  },

  toggleButtonLoading(btn, loadingText, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = loadingText;
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// === Networking Helper ===
async function apiFetch(path, options = {}) {
  try {
    const response = await fetch(`${API_URL}/${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await response.json();
  } catch (err) {
    throw new Error(err.message || 'Network error');
  }
}

// === Connection Management ===
const ConnectionManager = {
  async connect() {
    const username = DOM.username.value.trim();
    const password = DOM.password.value.trim();

    if (!username || !password)
      return UI.showLoginMessage('Please fill in username and password', 'error');

    UI.toggleButtonLoading(DOM.connectBtn, 'Connecting...', true);

    try {
      const data = await apiFetch('connect', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (!data.success)
        return UI.showLoginMessage(data.error || 'Connection failed', 'error');

      sessionId = data.sessionId;
      state.connected = true;
      state.credentials = { username };

      DOM.loginScreen.classList.add('hidden');
      DOM.mainInterface.classList.remove('hidden');
      DOM.connectionInfo.textContent = `${username}@postgres/${username}`;

      await SchemaManager.loadSchemas();
      UI.showMessage('Connected successfully!', 'success');
    } catch (err) {
      UI.showLoginMessage('Connection failed: ' + err.message, 'error');
    } finally {
      UI.toggleButtonLoading(DOM.connectBtn, 'Connect', false);
    }
  },

  async disconnect() {
    if (sessionId) {
      try {
        await apiFetch('disconnect', {
          method: 'POST',
          body: JSON.stringify({ sessionId })
        });
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }

    sessionId = null;
    Object.assign(state, { connected: false, schemas: [], selectedSchema: 'public' });

    DOM.mainInterface.classList.add('hidden');
    DOM.loginScreen.classList.remove('hidden');
    DOM.resultsContainer.classList.add('hidden');
    DOM.queryEditor.value = '';
    DOM.password.value = '';
  }
};

// === Schema Management ===
const SchemaManager = {
  async loadSchemas() {
    try {
      const data = await apiFetch(`schemas/${sessionId}`);
      if (!data.success) throw new Error(data.error);

      state.schemas = data.schemas;
      this.renderSchemas();
      await TableManager.loadTables();
    } catch (err) {
      UI.showMessage('Failed to load schemas: ' + err.message, 'error');
    }
  },

  async createSchema() {
    const name = DOM.newSchemaName.value.trim();
    if (!name) return UI.showMessage('Schema name cannot be empty', 'error');

    try {
      const data = await apiFetch(`schemas/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ schemaName: name })
      });
      if (!data.success) throw new Error(data.error);

      DOM.newSchemaName.value = '';
      await this.loadSchemas();
      this.selectSchema(name);
      UI.showMessage(data.message, 'success');
    } catch (err) {
      UI.showMessage('Failed to create schema: ' + err.message, 'error');
    }
  },

  async deleteSchema(schema) {
    if (!confirm(`Delete schema "${schema}"? This cannot be undone.`)) return;
    try {
      const data = await apiFetch(`schemas/${sessionId}/${schema}`, { method: 'DELETE' });
      if (!data.success) throw new Error(data.error);

      await this.loadSchemas();
      if (state.selectedSchema === schema) this.selectSchema('public');
      UI.showMessage(data.message, 'success');
    } catch (err) {
      UI.showMessage('Failed to delete schema: ' + err.message, 'error');
    }
  },

  renderSchemas() {
    DOM.schemaList.innerHTML = state.schemas.map(schema => `
      <div class="schema-item flex items-center justify-between p-2 rounded-md cursor-pointer transition ${
        state.selectedSchema === schema
          ? 'bg-indigo-50 border-2 border-indigo-500'
          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
      }" onclick="SchemaManager.selectSchema('${schema}')">
        <span class="text-sm font-medium">${schema}</span>
        ${!['public','pg_catalog','information_schema'].includes(schema)
          ? `<button onclick="event.stopPropagation(); SchemaManager.deleteSchema('${schema}')"
               class="p-1 text-red-600 hover:bg-red-50 rounded text-xl leading-none" title="Delete schema">×</button>`
          : ''}
      </div>
    `).join('');
  },

  selectSchema(schema) {
    state.selectedSchema = schema;
    DOM.currentSchema.textContent = schema;
    this.renderSchemas();
    TableManager.loadTables();
  }
};

// === Table Management ===
const TableManager = {
  async loadTables() {
    try {
      const data = await apiFetch(`tables/${sessionId}/${state.selectedSchema}`);
      if (!data.success) throw new Error(data.error);

      state.tables = data.tables;
      this.renderTables();
    } catch (err) {
      UI.showMessage('Failed to load tables: ' + err.message, 'error');
    }
  },

  renderTables() {
    if (!state.tables.length)
      return (DOM.tablesList.innerHTML =
        '<p class="text-sm text-gray-500 text-center py-4">No tables</p>');

    DOM.tablesList.innerHTML = state.tables.map(t => `
      <button onclick="TableManager.selectTable('${t.table_name}')"
        class="w-full text-left text-xs px-3 py-2 bg-gray-50 hover:bg-indigo-50 rounded-md transition flex items-center justify-between group">
        <span class="font-medium text-gray-700">${t.table_name}</span>
        <span class="text-gray-400 text-xs">${t.column_count} cols</span>
      </button>`).join('');
  },

  async selectTable(name) {
    const query = `SELECT * FROM ${state.selectedSchema}.${name} LIMIT 100;`;
    await QueryManager.executeDirect(query);
  }
};

// === Query Management ===
const QueryManager = {
  async execute() {
    const query = DOM.queryEditor.value.trim();
    if (!query) return UI.showMessage('Query cannot be empty', 'error');
    await this._execute(query);
  },

  async executeDirect(query) {
    await this._execute(query, true);
  },

  async _execute(query, silent = false) {
    UI.toggleButtonLoading(DOM.executeBtn, 'Executing...', true);

    try {
      const data = await apiFetch(`query/${sessionId}`, {
        method: 'POST',
        body: JSON.stringify({ query, schema: state.selectedSchema })
      });

      if (!data.success) throw new Error(data.error);

      if (data.columns?.length) {
        this.displayResults(data);
      } else {
        DOM.resultsContainer.classList.add('hidden');
        UI.showMessage(`${data.command} completed successfully. ${data.rowCount ?? 0} row(s) affected. Time: ${data.executionTime}`, 'success');
      }
      await TableManager.loadTables();
    } catch (err) {
      UI.showMessage('Query error: ' + err.message, 'error');
      DOM.resultsContainer.classList.add('hidden');
    } finally {
      UI.toggleButtonLoading(DOM.executeBtn, 'Execute', false);
    }
  },

  displayResults(data) {
    const cols = (data.columns || []).map(c => ({
      name: c.name,
      type: c.type || null,
      dataTypeID: c.dataTypeID || null
    }));

    const headerHTML = cols
      .map(c => `<th class="px-4 py-3 text-left font-semibold text-gray-700" 
        title="${UI.escapeHtml(c.type || String(c.dataTypeID) || '')}">
        ${UI.escapeHtml(c.name)}</th>`)
      .join('');

    const rowsHTML = (data.rows || [])
      .map(row => `
        <tr class="border-b hover:bg-gray-50">
          ${cols.map(c => {
            const val = row[c.name];
            return `<td class="px-4 py-3 text-gray-600">${
              val != null ? UI.escapeHtml(String(val)) : '<i class="text-gray-400">NULL</i>'
            }</td>`;
          }).join('')}
        </tr>`).join('') || 
      `<tr><td class="px-4 py-3 text-gray-500 italic" colspan="${cols.length || 1}">No rows</td></tr>`;

    DOM.resultsInfo.textContent = `${data.rowCount} rows • ${data.executionTime}`;
    DOM.resultsTable.innerHTML = `<thead><tr class="bg-gray-50 border-b">${headerHTML}</tr></thead><tbody>${rowsHTML}</tbody>`;
    DOM.resultsContainer.classList.remove('hidden');
  }
};

// === Results Maximize Handling ===
const ResultsView = {
  toggle() {
    const container = DOM.resultsContainer;
    if (!container) return;
    this.set(!container.classList.contains('results-maximized'));
  },

  set(maximize) {
    const container = DOM.resultsContainer;
    const btn = DOM.toggleBtn;
    const icon = DOM.maximizeIcon;
    if (!container || !btn || !icon) return;

    if (maximize) {
      container.classList.add('results-maximized');
      document.body.classList.add('no-scroll');

      const rect = DOM.topbar?.getBoundingClientRect();
      const topPx = rect ? Math.ceil(rect.bottom) + 8 : 16;
      Object.assign(container.style, {
        top: `${topPx}px`,
        left: '1rem',
        right: '1rem',
        bottom: '1rem'
      });

      btn.setAttribute('title', 'Unmaximize results');
      btn.setAttribute('aria-pressed', 'true');
      icon.classList.replace('fa-expand', 'fa-compress');
    } else {
      container.classList.remove('results-maximized');
      document.body.classList.remove('no-scroll');
      btn.setAttribute('title', 'Maximize results');
      btn.setAttribute('aria-pressed', 'false');
      icon.classList.replace('fa-compress', 'fa-expand');
      Object.assign(container.style, { top: '', left: '', right: '', bottom: '' });
    }
  }
};

DOM.newSchemaName?.addEventListener('keypress', e => e.key === 'Enter' && SchemaManager.createSchema());
DOM.username?.addEventListener('keypress', e => e.key === 'Enter' && ConnectionManager.connect());
DOM.password?.addEventListener('keypress', e => e.key === 'Enter' && ConnectionManager.connect());
DOM.toggleBtn?.addEventListener('click', () => ResultsView.toggle());

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && DOM.resultsContainer.classList.contains('results-maximized')) {
    ResultsView.set(false);
  }
});

document.getElementById("connectBtn")
  ?.addEventListener("click", () => ConnectionManager.connect());

document.getElementById("disconnectBtn")
  ?.addEventListener("click", () => ConnectionManager.disconnect());

document.getElementById("createSchemaBtn")
  ?.addEventListener("click", () => SchemaManager.createSchema());

document.getElementById("refreshTablesBtn")
  ?.addEventListener("click", () => TableManager.loadTables());

document.getElementById("executeBtn")
  ?.addEventListener("click", () => QueryManager.execute());

document.getElementById("clearQueryBtn")
  ?.addEventListener("click", () => {
    DOM.queryEditor.value = "";
  });

DOM.queryEditor?.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") QueryManager.execute();
});

DOM.resultsToggle?.addEventListener("click", () => ResultsView.toggle());