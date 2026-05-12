/**
 * HaloPlus - Side Panel Logic
 */

let TABLES = {};
let JOINS = [];
let VARIABLES = {};
let TEMPLATES = {};
let pageContext = null;
let isHaloTab = false;
let currentTheme = 'light';

const THEME_KEY = 'huTheme';
const SETTINGS_KEY = 'huSettings';
const CUSTOM_DOMAINS_KEY = 'huCustomHaloDomains';
const HALO_HOST_PATTERN = /(^|\.)(halopsa\.com|haloitsm\.com|haloservicedesk\.com)$/i;
const RELEASES_URL = 'https://www.gethaloplus.com/releases.html';

const PAGE_RELEVANT_TABLES = {
  ticket:       ['faults', 'actions', 'slahead', 'policy', 'requesttype', 'tstatus', 'flowheader'],
  organisation: ['area', 'users', 'site', 'company'],
  asset:        ['device', 'assettype'],
  agent:        ['uname', 'team'],
  lookup:       ['faults', 'actions'],
};

let viewerState = {
  tableId: '',
  filters: [],
  lookupOptions: {},
  lastRows: [],
  lastSql: '',
  pageSize: 20,
  currentPage: 1
};

let customHaloMatches = [];

const TABLE_ROUTES = {
  faults:  id => `/tickets?id=${encodeURIComponent(id)}`,
  area:    id => `/customers?clientid=${encodeURIComponent(id)}`,
  uname:   id => `/config/agents/agents?agentid=${encodeURIComponent(id)}`,
  users:   id => `/customers?mainview=user&userid=${encodeURIComponent(id)}`,
  device:  id => `/assets?id=${encodeURIComponent(id)}`,
  kbentry: id => `/knowledgebase?id=${encodeURIComponent(id)}`,
};

const LOOKUP_LABEL_COLUMNS = {
  tstatus: 'TStatusDesc',
  policy: 'PDesc',
  users: 'UUsername',
  site: 'SDesc',
  area: 'AAreaDesc',
  requesttype: 'RTDesc',
  servsite: 'STDesc',
  slahead: 'SLDesc',
  device: 'DInvNo',
  uname: 'UName',
  flowheader: 'FHName',
  company: 'CDesc',
  sectiondetail: 'SDSectionName',
  xtype: 'TDesc',
  generic: 'GDesc',
  tree: 'TreeDesc',
  servicecategory: 'SvcDesc',
  stdrequest: 'STDid',
  item: 'IDesc',
  kbentry: 'Abstract'
};

async function init() {
  await initTheme();
  syncManifestVersion();
  TABLES = await loadJSON('../schema/tables.json');
  await loadCustomSchema();
  await loadCustomHaloDomains();
  const joinsData = await loadJSON('../schema/joins.json');
  JOINS = joinsData.joins;
  const varsData = await loadJSON('../schema/variables.json');
  VARIABLES = varsData.variables;
  const tplData = await loadJSON('../templates/templates.json');
  TEMPLATES = tplData.categories;

  setupTabs();
  renderSchemaExplorer();
  renderDataViewer();
  setupSearch();
  setupViewerEvents();
  setupUtilityEvents();
  setupRegrantButton();
  listenForContext();
  await refreshActiveTabState();

  // Auto-refresh schema silently on load (requires an active Halo tab)
  if (isHaloTab) autoRefreshSchema();
}

function autoRefreshSchema() {
  refreshSchema().then(result => {
    if (!result) return;
    populateTablePicker();
    renderSchemaExplorer();
  }).catch(() => {});
}

async function loadJSON(path) {
  const resp = await fetch(path);
  return resp.json();
}

async function initTheme() {
  const data = await new Promise(resolve => chrome.storage.local.get([THEME_KEY], resolve));
  currentTheme = data?.[THEME_KEY] === 'dark' ? 'dark' : 'light';
  applyTheme(currentTheme);
}

function syncManifestVersion() {
  try {
    const version = chrome?.runtime?.getManifest?.()?.version;
    if (!version) return;
    const footer = document.getElementById('footerVersion');
    if (footer) {
      footer.textContent = `v${version}`;
      footer.addEventListener('click', () => {
        chrome.tabs.create({ url: RELEASES_URL });
      });
    }
  } catch (error) {
    // Ignore in non-extension contexts
  }
}

function applyTheme(theme) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme = currentTheme;
}

async function toggleTheme() {
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  await new Promise(resolve => chrome.storage.local.set({ [THEME_KEY]: nextTheme }, resolve));
  return nextTheme;
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById(`tab-${tabName}`);
  if (content) content.classList.add('active');
  document.getElementById('headerSettingsBtn')?.classList.toggle('active', tabName === 'settings');
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tab);
      if (tab.dataset.tab !== 'sql-helper') {
        document.getElementById('sqlOutput').style.display = 'none';
      }
    });
  });

  document.querySelectorAll('.subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.helper-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`helper-${tab.dataset.helperTab}`).classList.add('active');
    });
  });
}

function renderSchemaExplorer(filter = '') {
  const container = document.getElementById('schemaList');
  container.innerHTML = '';
  const lowerFilter = filter.toLowerCase();

  Object.entries(TABLES).forEach(([tableId, table]) => {
    const cols = Object.entries(table.columns);
    const tableMatches = !lowerFilter ||
      tableId.includes(lowerFilter) ||
      table.label.toLowerCase().includes(lowerFilter) ||
      cols.some(([cn, cd]) => cn.toLowerCase().includes(lowerFilter) || cd.label.toLowerCase().includes(lowerFilter));

    if (!tableMatches) return;

    const wrapper = el('div', { class: 'schema-table' });

    const header = el('div', { class: 'schema-table-header' });
    header.innerHTML = `
      <div>
        <span class="st-name">${escapeHtml(tableId)}</span>
        <span class="st-label">${escapeHtml(table.label)}</span>
      </div>
      <span class="st-arrow">&#9654;</span>
    `;
    header.addEventListener('click', () => wrapper.classList.toggle('open'));

    const colsDiv = el('div', { class: 'schema-cols' });
    cols.forEach(([colName, col]) => {
      if (lowerFilter && !colName.toLowerCase().includes(lowerFilter) && !col.label.toLowerCase().includes(lowerFilter) && !tableId.includes(lowerFilter) && !table.label.toLowerCase().includes(lowerFilter)) return;

      const row = el('div', { class: 'schema-col' });
      let badges = '';
      if (col.pk) badges += '<span class="sc-pk">PK</span> ';
      if (col.fk) badges += `<span class="sc-fk">FK -> ${escapeHtml(col.fk)}</span> `;
      row.innerHTML = `
        <span class="sc-name">${escapeHtml(colName)}</span>
        <span class="sc-label">${escapeHtml(col.label)}</span>
        <span class="sc-type">${escapeHtml(col.type)}</span>
        ${badges}
      `;
      colsDiv.appendChild(row);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(colsDiv);
    container.appendChild(wrapper);

    // Auto-open if searching
    if (lowerFilter) wrapper.classList.add('open');
  });
}

let TABLE_PICKER_CUSTOM_TABLES = new Set();

function renderDataViewer() {
  populateTablePicker();

  if (!viewerState.tableId) {
    document.getElementById('recordHeader').innerHTML = `
      <div class="empty-state compact">
        <div class="es-text">Choose a table to build a record view</div>
      </div>
    `;
    document.getElementById('filterPanel').style.display = 'none';
    document.getElementById('recordTableWrap').innerHTML = '';
    const ribEl = document.getElementById('resultsInfoBar');
    if (ribEl) ribEl.style.display = 'none';
    const pg = document.getElementById('viewerPagination');
    if (pg) pg.style.display = 'none';
    return;
  }

  renderRecordViewer();
}

function getTablePickerEntries(searchTerm, includeCustom) {
  const lower = searchTerm.toLowerCase();
  return Object.entries(TABLES)
    .filter(([tableId, table]) => {
      const isCustom = TABLE_PICKER_CUSTOM_TABLES.has(tableId);
      if (isCustom && !includeCustom) return false;
      if (!lower) return true;
      return tableId.includes(lower) || table.label.toLowerCase().includes(lower);
    })
    .sort(([aId, a], [bId, b]) => {
      const ac = TABLE_PICKER_CUSTOM_TABLES.has(aId) ? 1 : 0;
      const bc = TABLE_PICKER_CUSTOM_TABLES.has(bId) ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return a.label.localeCompare(b.label);
    });
}

function populateTablePicker(searchTerm = '') {
  const list = document.getElementById('tablePickerList');
  if (!list) return;

  const includeCustom = document.getElementById('showCustomTables')?.checked ?? false;
  const entries = getTablePickerEntries(searchTerm, includeCustom);

  list.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'csd-empty';
    empty.textContent = searchTerm ? 'No tables match.' : 'No tables available.';
    list.appendChild(empty);
    return;
  }

  entries.slice(0, 80).forEach(([tableId, table]) => {
    const isCustom = TABLE_PICKER_CUSTOM_TABLES.has(tableId);
    const item = document.createElement('div');
    item.className = `csd-item${tableId === viewerState.tableId ? ' active' : ''}`;
    item.dataset.tableId = tableId;
    item.innerHTML = `
      <span class="csd-item-name">${escapeHtml(tableId)}</span>
      <span class="csd-item-label">${escapeHtml(table.label)}</span>
      ${isCustom ? '<span class="csd-item-badge">Custom</span>' : ''}
    `;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      selectViewerTable(tableId);
    });
    list.appendChild(item);
  });
}

function selectViewerTable(tableId) {
  viewerState.tableId = tableId;
  viewerState.filters = [];
  viewerState.lookupOptions = {};
  viewerState.lastRows = [];
  viewerState.currentPage = 1;
  document.getElementById('viewerQuickFilter').value = '';
  const ribEl = document.getElementById('resultsInfoBar');
  if (ribEl) ribEl.style.display = 'none';
  const rowsBox = document.getElementById('filterRowsBox');
  if (rowsBox) rowsBox.style.display = 'none';

  const displayEl = document.getElementById('tablePickerValue');
  const wrapEl    = document.getElementById('tablePickerWrap');
  const searchEl  = document.getElementById('viewerTableSearch');
  const clearBtn  = document.getElementById('clearTableBtn');
  if (displayEl) { displayEl.textContent = tableId; displayEl.classList.remove('placeholder'); }
  if (searchEl) searchEl.value = '';
  if (wrapEl) wrapEl.classList.remove('open');
  if (clearBtn) clearBtn.style.display = tableId ? '' : 'none';

  renderDataViewer();
}

function renderRecordViewer() {
  const tableId = viewerState.tableId;
  const table = TABLES[tableId];
  const columns = getViewerColumns(tableId);
  const pkColumns = Object.entries(table.columns).filter(([, col]) => col.pk).map(([name]) => name);

  document.getElementById('recordHeader').innerHTML = `
    <div>
      <div class="record-title">${escapeHtml(table.label)}</div>
      <div class="record-subtitle">${escapeHtml(tableId)}${table.description ? ` - ${escapeHtml(table.description)}` : ''}</div>
    </div>
    <div class="record-count">${Object.keys(table.columns).length} columns</div>
  `;

  document.getElementById('filterPanel').style.display = '';
  const ribEl = document.getElementById('resultsInfoBar');
  if (ribEl) ribEl.style.display = 'none';
  renderViewerFilters();

  const tableEl = el('table', { class: 'record-table' });
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach(({ name, col }) => {
    const th = el('th');
    th.innerHTML = `
      <span class="rt-label">${escapeHtml(col.label)}</span>
      <span class="rt-name">${escapeHtml(name)}${pkColumns.includes(name) ? ' PK' : ''}</span>
    `;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = el('tbody');
  const placeholder = el('tr', { class: 'placeholder-row' });
  const td = el('td', { colspan: String(columns.length) });
  td.textContent = 'Generate and run the SQL to load live records from Halo.';
  placeholder.appendChild(td);
  tbody.appendChild(placeholder);

  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);

  const wrap = document.getElementById('recordTableWrap');
  wrap.innerHTML = '';
  wrap.appendChild(tableEl);

  buildViewerSQL();
}

function getViewerColumns(tableId) {
  const table = TABLES[tableId];
  const entries = Object.entries(table.columns || {});
  const scored = entries.map(([name, col], index) => ({
    name,
    col,
    index,
    score: scoreViewerColumn(name, col)
  }));

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index);
}

function scoreViewerColumn(name, col) {
  const haystack = `${name} ${col.label}`.toLowerCase();
  let score = 0;
  if (col.pk) score += 100;
  if (/(id|num|number)$/.test(name.toLowerCase())) score += 25;
  if (/(name|desc|title|summary|email|status|type|date|who|user|client|site)/.test(haystack)) score += 60;
  if (/(memo|note|body|resolution|clearance|description)/.test(haystack)) score -= 35;
  if (String(col.type).includes('ntext') || String(col.type).includes('4000')) score -= 45;
  return score;
}


function mergeCustomSchema(customTables, extraColumns) {
  Object.entries(customTables || {}).forEach(([tableId, def]) => {
    if (!TABLES[tableId]) {
      TABLES[tableId] = def;
      TABLE_PICKER_CUSTOM_TABLES.add(tableId);
    }
  });
  Object.entries(extraColumns || {}).forEach(([tableId, cols]) => {
    if (TABLES[tableId]) {
      Object.entries(cols).forEach(([col, def]) => {
        if (!TABLES[tableId].columns[col]) TABLES[tableId].columns[col] = def;
      });
    }
  });
}

async function loadCustomSchema() {
  return new Promise(resolve => {
    chrome.storage.local.get(['huCustomSchema'], data => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      const schema = data.huCustomSchema;
      if (schema) mergeCustomSchema(schema.customTables, schema.extraColumns);
      resolve(schema || null);
    });
  });
}

async function refreshSchema() {
  const sql = `SELECT TOP 10000 TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME, ORDINAL_POSITION`;
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'RUN_HALO_REPORT', data: { sql, name: 'HaloPlus schema discovery' } }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        reject(new Error(response?.error || chrome.runtime.lastError?.message || 'No Halo tab found'));
        return;
      }
      const rows = extractReportRows(response.data);
      const customTables = {};
      const extraColumns = {};

      rows.forEach(row => {
        const getVal = key => { const k = Object.keys(row).find(k2 => k2.toLowerCase() === key); return k ? String(row[k] ?? '') : ''; };
        const tableName = getVal('table_name').toLowerCase();
        const colName   = getVal('column_name');
        const dataType  = getVal('data_type') || 'nvarchar';
        if (!tableName || !colName) return;

        if (!TABLES[tableName]) {
          if (!customTables[tableName]) customTables[tableName] = { label: tableName, description: 'Custom table (discovered)', columns: {} };
          customTables[tableName].columns[colName] = { type: dataType, label: colName };
        } else if (!TABLES[tableName].columns[colName]) {
          if (!extraColumns[tableName]) extraColumns[tableName] = {};
          extraColumns[tableName][colName] = { type: dataType, label: colName };
        }
      });

      const payload = { customTables, extraColumns, lastRefreshed: new Date().toISOString() };
      chrome.storage.local.set({ huCustomSchema: payload });
      mergeCustomSchema(customTables, extraColumns);

      resolve({
        customTablesCount: Object.keys(customTables).length,
        extraColumnsCount: Object.values(extraColumns).reduce((n, c) => n + Object.keys(c).length, 0),
        totalRows: rows.length
      });
    });
  });
}

function setupViewerEvents() {
  const pickerWrap    = document.getElementById('tablePickerWrap');
  const triggerBtn    = document.getElementById('tablePickerTrigger');
  const searchEl      = document.getElementById('viewerTableSearch');
  const clearTableBtn = document.getElementById('clearTableBtn');
  const customToggle  = document.getElementById('showCustomTables');

  function openPicker() {
    pickerWrap.classList.add('open');
    searchEl.focus();
    populateTablePicker(searchEl.value.trim());
  }

  function closePicker() {
    pickerWrap.classList.remove('open');
  }

  triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    pickerWrap.classList.contains('open') ? closePicker() : openPicker();
  });

  searchEl.addEventListener('input', () => populateTablePicker(searchEl.value.trim()));
  searchEl.addEventListener('click', e => e.stopPropagation());

  customToggle.addEventListener('change', () => populateTablePicker(searchEl.value.trim()));

  clearTableBtn.addEventListener('click', e => {
    e.stopPropagation();
    viewerState.tableId = '';
    viewerState.filters = [];
    viewerState.lookupOptions = {};
    viewerState.lastRows = [];
    viewerState.currentPage = 1;
    const displayEl = document.getElementById('tablePickerValue');
    if (displayEl) { displayEl.textContent = 'Select a table...'; displayEl.classList.add('placeholder'); }
    clearTableBtn.style.display = 'none';
    searchEl.value = '';
    closePicker();
    const pg = document.getElementById('viewerPagination');
    if (pg) pg.style.display = 'none';
    const rib = document.getElementById('resultsInfoBar');
    if (rib) rib.style.display = 'none';
    renderDataViewer();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#tablePickerWrap')) closePicker();
    if (!e.target.closest('#exportWrap')) {
      const ew = document.getElementById('exportWrap');
      if (ew) ew.classList.remove('open');
    }
  });

  document.getElementById('addViewerFilterBtn').addEventListener('click', () => {
    if (!viewerState.tableId) return;
    const firstColumn = Object.keys(TABLES[viewerState.tableId].columns)[0];
    viewerState.filters.push({ connector: 'AND', column: firstColumn, operator: '=', value: '' });
    renderViewerFilters();
  });

  document.getElementById('viewerQuickFilter').addEventListener('input', () => {
    if (viewerState.tableId) buildViewerSQL();
  });

  document.getElementById('runViewerBtn').addEventListener('click', () => buildViewerSQL({ run: true }));

  document.getElementById('pagePrevBtn').addEventListener('click', () => {
    if (viewerState.currentPage > 1) { viewerState.currentPage--; displayPagedRows(); }
  });
  document.getElementById('pageNextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(viewerState.lastRows.length / viewerState.pageSize);
    if (viewerState.currentPage < totalPages) { viewerState.currentPage++; displayPagedRows(); }
  });
  document.getElementById('pageSizeSelect').addEventListener('change', e => {
    viewerState.pageSize = parseInt(e.target.value, 10);
    viewerState.currentPage = 1;
    displayPagedRows();
  });

  const exportTrigger = document.getElementById('exportTriggerBtn');
  const exportWrapEl  = document.getElementById('exportWrap');
  if (exportTrigger && exportWrapEl) {
    exportTrigger.addEventListener('click', e => {
      e.stopPropagation();
      exportWrapEl.classList.toggle('open');
    });
  }
  document.getElementById('exportCsvBtn').addEventListener('click', () => { exportRows('csv'); exportWrapEl?.classList.remove('open'); });
  document.getElementById('exportXlsxBtn').addEventListener('click', () => { exportRows('xlsx'); exportWrapEl?.classList.remove('open'); });
  document.getElementById('exportJsonBtn').addEventListener('click', () => { exportRows('json'); exportWrapEl?.classList.remove('open'); });
}

function setupUtilityEvents() {
  setupThemeToggle();
  setupHeaderSettingsButton();
  bindUtilityButton('openPaletteBtn', 'HU_OPEN_PALETTE');
  bindUtilityButton('showRecentBtn', 'HU_SHOW_RECENT');
  bindUtilityButton('openJsonBtn', 'HU_OPEN_JSON');
  bindUtilityButton('openTicket360Btn', 'HU_OPEN_TICKET360');
  bindUtilityButton('openTimelineBtn', 'HU_OPEN_TIMELINE');
  setupFieldToggleButton();
  setupCommandsSection();
  setupPreferences();
  setupCustomDomainSettings();
}

function setupThemeToggle() {
  const btn = document.getElementById('headerThemeBtn');
  if (!btn) return;

  const updateBtn = (theme) => {
    const isDark = theme === 'dark';
    btn.dataset.theme = isDark ? 'dark' : 'light';
    btn.dataset.active = isDark ? '1' : '';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  };

  updateBtn(currentTheme);

  btn.addEventListener('click', async () => {
    const status = document.getElementById('utilityStatus');
    if (status) status.textContent = 'Updating theme...';
    try {
      const nextTheme = await toggleTheme();
      updateBtn(nextTheme);
      if (status) status.textContent = nextTheme === 'dark' ? 'Dark mode enabled.' : 'Light mode enabled.';
    } catch (e) {
      if (status) status.textContent = 'Could not update the theme preference.';
    }
  });
}

function setupHeaderSettingsButton() {
  const btn = document.getElementById('headerSettingsBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    switchToTab('settings');
    document.getElementById('sqlOutput').style.display = 'none';
  });
}

function setupFieldToggleButton() {
  const btn = document.getElementById('toggleFieldsBtn');
  const status = document.getElementById('utilityStatus');

  function updateBtn(on) {
    const title = btn.querySelector('.utility-title');
    const copy = btn.querySelector('.utility-copy');
    if (title) title.textContent = on ? 'Field API names: ON' : 'Field API names';
    if (copy) copy.textContent = on ? 'Click or double-click page to hide.' : 'Toggle internal field names on form labels.';
    btn.dataset.fieldsOn = on ? '1' : '';
  }

  btn.addEventListener('click', () => {
    status.textContent = 'Sending command...';
    try {
      chrome.runtime.sendMessage({ type: 'HU_TOGGLE_FIELDS' }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          status.textContent = chrome.runtime.lastError?.message || 'Open and refresh a Halo tab first.';
          return;
        }
        updateBtn(response.on);
        status.textContent = response.on ? 'Field names visible.' : 'Field names hidden.';
      });
    } catch (e) {
      status.textContent = 'Open Halo in Chrome, then try again.';
    }
  });
}

function bindUtilityButton(id, type, data = {}) {
  document.getElementById(id).addEventListener('click', () => {
    const status = document.getElementById('utilityStatus');
    status.textContent = 'Sending command to active Halo tab...';
    try {
      chrome.runtime.sendMessage({ type, data }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          status.textContent = response?.error || chrome.runtime.lastError?.message || 'Open and refresh a Halo tab first.';
          return;
        }
        status.textContent = 'Command sent.';
      });
    } catch (e) {
      status.textContent = 'Open Halo in Chrome, then try again.';
    }
  });
}

function renderViewerFilters() {
  const container = document.getElementById('viewerFilters');
  container.innerHTML = '';
  const rowsBox = document.getElementById('filterRowsBox');
  if (rowsBox) rowsBox.style.display = viewerState.filters.length > 0 ? '' : 'none';

  viewerState.filters.forEach((filter, index) => {
    const row = el('div', { class: 'sn-filter-row' });

    // AND/OR connector \u2014 hidden (visibility:hidden) on first row to preserve grid alignment
    const connectorSelect = el('select', { class: 'sn-connector' });
    ['AND', 'OR'].forEach(c => connectorSelect.appendChild(el('option', { value: c }, c)));
    connectorSelect.value = filter.connector || 'AND';
    if (index === 0) connectorSelect.style.visibility = 'hidden';

    const columnSelect = el('select', { class: 'sn-field' });
    Object.entries(TABLES[viewerState.tableId].columns).forEach(([name, col]) => {
      const opt = el('option', { value: name }, `${col.label} (${name})`);
      if (name === filter.column) opt.selected = true;
      columnSelect.appendChild(opt);
    });

    const opSelect = el('select', { class: 'sn-op' });
    ['=', '!=', '>', '<', '>=', '<=', 'contains', 'starts with', 'is empty', 'is not empty'].forEach(op => {
      const opt = el('option', { value: op }, op);
      if (op === filter.operator) opt.selected = true;
      opSelect.appendChild(opt);
    });

    const lookupMeta = getLookupMeta(viewerState.tableId, filter.column);
    let valControl;
    if (lookupMeta) {
      valControl = el('select', { class: 'sn-value' });
      valControl.appendChild(el('option', { value: '' }, 'Loading\u2026'));
      valControl.style.display = operatorNeedsValue(filter.operator) ? '' : 'none';
      hydrateLookupSelect(lookupMeta, valControl, filter.value);
    } else {
      valControl = el('input', { type: 'text', class: 'sn-value', placeholder: 'Value' });
      valControl.value = filter.value || '';
      valControl.style.display = operatorNeedsValue(filter.operator) ? '' : 'none';
    }

    const removeBtn = el('button', { class: 'sn-remove', title: 'Remove' }, '\u00d7');

    const update = () => {
      viewerState.filters[index] = {
        connector: connectorSelect.value,
        column: columnSelect.value,
        operator: opSelect.value,
        value: valControl.value || ''
      };
      valControl.style.display = operatorNeedsValue(opSelect.value) ? '' : 'none';
    };

    connectorSelect.addEventListener('change', update);
    columnSelect.addEventListener('change', () => { update(); renderViewerFilters(); });
    opSelect.addEventListener('change', () => { update(); buildViewerSQL(); });
    if (lookupMeta) {
      valControl.addEventListener('change', () => { update(); buildViewerSQL(); });
    } else {
      valControl.addEventListener('input', update);
    }
    removeBtn.addEventListener('click', () => {
      viewerState.filters.splice(index, 1);
      renderViewerFilters();
      buildViewerSQL();
    });

    row.appendChild(connectorSelect);
    row.appendChild(columnSelect);
    row.appendChild(opSelect);
    row.appendChild(valControl);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function hydrateLookupSelect(meta, selectEl, currentValue) {
  const cacheKey = `${meta.table}.${meta.keyColumn}.${meta.labelColumn}`;
  const cached = viewerState.lookupOptions[cacheKey];
  if (cached) {
    renderSelectOptions(selectEl, cached, currentValue);
    return;
  }

  const baseAlias = 'B';
  const lookupAlias = 'L';
  const sql = `
SELECT TOP 200
  ${baseAlias}.${meta.baseColumn} AS [value],
  ${lookupAlias}.${meta.labelColumn} AS [label],
  COUNT(*) AS [usage_count]
FROM
  ${meta.baseTable} ${baseAlias}
  LEFT JOIN ${meta.table} ${lookupAlias} ON ${baseAlias}.${meta.baseColumn} = ${lookupAlias}.${meta.keyColumn}
WHERE
  ${baseAlias}.${meta.baseColumn} IS NOT NULL
  AND ${lookupAlias}.${meta.labelColumn} IS NOT NULL
GROUP BY
  ${baseAlias}.${meta.baseColumn},
  ${lookupAlias}.${meta.labelColumn}
ORDER BY
  ${lookupAlias}.${meta.labelColumn} ASC,
  COUNT(*) DESC
`.trim();

  chrome.runtime.sendMessage({
    type: 'RUN_HALO_REPORT',
    data: { sql, name: `HaloPlus ${meta.table} lookup` }
  }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      selectEl.innerHTML = '';
      selectEl.appendChild(el('option', { value: '' }, '\u2014 any \u2014'));
      return;
    }
    const rows = normalizeLookupRows(extractReportRows(response.data)
      .map(row => ({ value: row.value, label: row.label, usageCount: Number(row.usage_count) || 0 }))
      .filter(row => row.value !== undefined && row.label !== undefined));
    viewerState.lookupOptions[cacheKey] = rows;
    renderSelectOptions(selectEl, rows, currentValue);
  });
}

function renderSelectOptions(selectEl, rows, currentValue) {
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option', { value: '' }, '\u2014 any \u2014'));
  rows.forEach(row => {
    selectEl.appendChild(el('option', { value: String(row.value) }, row.label));
  });
  if (currentValue !== undefined && currentValue !== '') {
    selectEl.value = String(currentValue);
  }
}

function getLookupMeta(tableId, columnName) {
  const fk = TABLES[tableId]?.columns?.[columnName]?.fk;
  if (!fk || !fk.includes('.')) return null;

  const [lookupTable, keyColumn] = fk.split('.');
  const lookupDef = TABLES[lookupTable];
  if (!lookupDef) return null;

  const labelColumn = LOOKUP_LABEL_COLUMNS[lookupTable] ||
    Object.entries(lookupDef.columns).find(([name, col]) => {
      const haystack = `${name} ${col.label}`.toLowerCase();
      return /(name|desc|title|email|summary)/.test(haystack) && name !== keyColumn;
    })?.[0];

  if (!labelColumn || !lookupDef.columns[labelColumn]) return null;
  return { table: lookupTable, keyColumn, labelColumn, baseTable: tableId, baseColumn: columnName };
}

function hydrateLookupDatalist(meta, datalist) {
  const cacheKey = `${meta.table}.${meta.keyColumn}.${meta.labelColumn}`;
  const cached = viewerState.lookupOptions[cacheKey];
  if (cached) {
    renderLookupOptions(datalist, cached);
    return;
  }

  const baseAlias = 'B';
  const lookupAlias = 'L';
  const sql = `
SELECT TOP 200
  ${baseAlias}.${meta.baseColumn} AS [value],
  ${lookupAlias}.${meta.labelColumn} AS [label],
  COUNT(*) AS [usage_count]
FROM
  ${meta.baseTable} ${baseAlias}
  LEFT JOIN ${meta.table} ${lookupAlias} ON ${baseAlias}.${meta.baseColumn} = ${lookupAlias}.${meta.keyColumn}
WHERE
  ${baseAlias}.${meta.baseColumn} IS NOT NULL
  AND ${lookupAlias}.${meta.labelColumn} IS NOT NULL
GROUP BY
  ${baseAlias}.${meta.baseColumn},
  ${lookupAlias}.${meta.labelColumn}
ORDER BY
  ${lookupAlias}.${meta.labelColumn} ASC,
  COUNT(*) DESC
`.trim();

  chrome.runtime.sendMessage({
    type: 'RUN_HALO_REPORT',
    data: { sql, name: `HaloPlus ${meta.table} lookup` }
  }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) return;
    const rows = normalizeLookupRows(extractReportRows(response.data)
      .map(row => ({
        value: row.value,
        label: row.label,
        usageCount: Number(row.usage_count) || 0
      }))
      .filter(row => row.value !== undefined && row.label !== undefined));
    viewerState.lookupOptions[cacheKey] = rows;
    renderLookupOptions(datalist, rows);
  });
}

function normalizeLookupRows(rows) {
  const exact = new Map();
  rows.forEach(row => {
    const key = `${String(row.label).toLowerCase()}|${String(row.value).toLowerCase()}`;
    const existing = exact.get(key);
    if (!existing || row.usageCount > existing.usageCount) exact.set(key, row);
  });

  const deduped = [...exact.values()];
  const labelCounts = deduped.reduce((acc, row) => {
    const key = String(row.label).toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return deduped.map(row => ({
    ...row,
    duplicateLabel: labelCounts[String(row.label).toLowerCase()] > 1
  }));
}

function renderLookupOptions(datalist, rows) {
  datalist.innerHTML = '';
  rows.forEach(row => {
    const value = row.duplicateLabel
      ? `${row.label} [ID ${row.value}]`
      : `${row.label} (${row.value})`;
    const label = row.usageCount
      ? `${row.usageCount} matching records`
      : String(row.value);
    datalist.appendChild(el('option', {
      value,
      label
    }));
  });
}

function buildViewerSQL(options = {}) {
  if (!viewerState.tableId) return '';

  const tableId = viewerState.tableId;
  const table = TABLES[tableId];
  const alias = table.alias || tableId;
  const columns = getViewerColumns(tableId);
  const parts = ['SELECT TOP 10000'];

  parts.push(columns.map(({ name, col }, index) => {
    const comma = index < columns.length - 1 ? ',' : '';
    let expr = `${alias}.${name}`;
    if (String(col.type).includes('ntext')) {
      expr = `CONVERT(nvarchar(max), ${expr})`;
    }
    return `  ${expr} AS [${col.label}]${comma}`;
  }).join('\n'));

  parts.push('FROM');
  parts.push(`  ${tableId} ${alias}`);

  const where = buildViewerWhere(alias, table);
  if (where.length) {
    parts.push('WHERE');
    where.forEach(({ connector, clause }) => {
      parts.push(`  ${connector ? connector + ' ' : ''}${clause}`);
    });
  }

  const defaultOrder = getDefaultOrderColumn(table);
  if (defaultOrder) {
    parts.push('ORDER BY');
    parts.push(`  ${alias}.${defaultOrder} DESC`);
  }

  const sql = parts.join('\n');
  viewerState.lastSql = sql;

  const sqlBtn = document.getElementById('viewerSqlBtn');
  if (sqlBtn) {
    sqlBtn.textContent = 'Copy SQL';
    sqlBtn.classList.remove('copied');
    sqlBtn.onclick = () => {
      navigator.clipboard.writeText(sql).then(() => {
        sqlBtn.textContent = 'Copied!';
        sqlBtn.classList.add('copied');
        setTimeout(() => {
          sqlBtn.textContent = 'Copy SQL';
          sqlBtn.classList.remove('copied');
        }, 2000);
      });
    };
  }

  if (options.run) runHaloReport(sql);
  return sql;
}

function buildViewerWhere(alias, table) {
  const parts = [];

  viewerState.filters.forEach((filter, index) => {
    const col = table.columns[filter.column];
    if (!col) return;
    const clause = formatViewerFilter(`${alias}.${filter.column}`, filter.operator, filter.value, col.type, filter);
    if (!clause) return;
    parts.push({ connector: index === 0 || parts.length === 0 ? null : (filter.connector || 'AND'), clause });
  });

  const quickFilter = document.getElementById('viewerQuickFilter')?.value.trim();
  if (quickFilter) {
    const textCols = Object.entries(table.columns)
      .filter(([, col]) => /(char|text|varchar)/i.test(col.type))
      .slice(0, 6)
      .map(([name]) => `${alias}.${name} LIKE '%${escapeSql(quickFilter)}%'`);
    if (textCols.length) {
      parts.push({ connector: parts.length > 0 ? 'AND' : null, clause: `(${textCols.join(' OR ')})` });
    }
  }

  return parts;
}

function formatViewerFilter(columnRef, operator, value, type, filter = null) {
  if (operator === 'is empty') return `(${columnRef} IS NULL OR ${columnRef} = '')`;
  if (operator === 'is not empty') return `(${columnRef} IS NOT NULL AND ${columnRef} <> '')`;
  if (!value.trim()) return '';
  if (operator === 'contains') return `${columnRef} LIKE '%${escapeSql(value)}%'`;
  if (operator === 'starts with') return `${columnRef} LIKE '${escapeSql(value)}%'`;

  const resolvedValue = resolveFilterValue(filter, value);
  const sqlValue = isNumericType(type) && !Number.isNaN(Number(resolvedValue))
    ? resolvedValue
    : `'${escapeSql(resolvedValue)}'`;
  return `${columnRef} ${operator} ${sqlValue}`;
}

function resolveFilterValue(filter, value) {
  if (!filter) return value;

  const duplicateId = String(value).match(/\[ID\s+([^\]]+)\]\s*$/i);
  if (duplicateId) return duplicateId[1];

  const parenthesized = String(value).match(/\(([^()]+)\)\s*$/);
  if (parenthesized) return parenthesized[1];

  const lookupMeta = getLookupMeta(viewerState.tableId, filter.column);
  if (!lookupMeta) return value;

  const cacheKey = `${lookupMeta.table}.${lookupMeta.keyColumn}.${lookupMeta.labelColumn}`;
  const options = viewerState.lookupOptions[cacheKey] || [];
  const lower = String(value).trim().toLowerCase();
  const match = options.find(option =>
    String(option.label).toLowerCase() === lower ||
    String(option.value).toLowerCase() === lower
  );
  return match ? match.value : value;
}

function operatorNeedsValue(operator) {
  return operator !== 'is empty' && operator !== 'is not empty';
}

function isNumericType(type) {
  return /(int|float|decimal|numeric|money|bit|bool)/i.test(type);
}

function getDefaultOrderColumn(table) {
  const entries = Object.entries(table.columns);
  const dateCol = entries.find(([name, col]) => /date|time|whe_|occured|created/i.test(`${name} ${col.label}`));
  if (dateCol) return dateCol[0];
  const pkCol = entries.find(([, col]) => col.pk);
  return pkCol ? pkCol[0] : entries[0]?.[0];
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

const VAR_LABELS = {
  '$ticketid': { label: 'Ticket ID', hint: 'e.g. 2996' },
  '$agentid':  { label: 'Agent ID',  hint: 'e.g. 3' },
  '$userid':   { label: 'User ID',   hint: 'e.g. 12' },
  '$siteid':   { label: 'Site ID',   hint: 'e.g. 5' },
  '$clientid': { label: 'Client ID', hint: 'e.g. 8' },
  '$invoiceid':{ label: 'Invoice ID',hint: 'e.g. 101' }
};

function showSQL(sql, tablesUsed = [], variablesUsed = []) {
  const output = document.getElementById('sqlOutput');
  const code = document.getElementById('sqlCode');
  const meta = document.getElementById('sqlMeta');
  const varInputs = document.getElementById('varInputs');
  const copyBtn = document.getElementById('copyBtn');
  const runBtn = document.getElementById('runReportBtn');

  code.textContent = sql;
  output.style.display = '';

  // Detect variables actually present in the SQL (not just declared in template)
  const presentVars = Object.keys(VAR_LABELS).filter(v => sql.includes(v));

  if (presentVars.length) {
    varInputs.style.display = '';
    varInputs.innerHTML = '<div class="var-inputs-label">Fill in values to run this query:</div>';
    presentVars.forEach(varName => {
      const { label, hint } = VAR_LABELS[varName];
      const row = el('div', { class: 'var-input-row' });
      const lbl = el('label', { class: 'var-input-label' }, label);
      const input = el('input', { type: 'text', class: 'var-input-field', placeholder: hint, 'data-var': varName });
      input.addEventListener('input', () => {
        code.textContent = resolveVars(sql, varInputs);
      });
      row.appendChild(lbl);
      row.appendChild(input);
      varInputs.appendChild(row);
    });

    // Try to pre-fill from the active page context
    try {
      chrome.runtime.sendMessage({ type: 'HU_GET_CONTEXT' }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) return;
        const vars = response.data?.vars || {};
        varInputs.querySelectorAll('.var-input-field').forEach(input => {
          const val = vars[input.dataset.var];
          if (val && !input.value) {
            input.value = val;
            input.classList.add('var-input-prefilled');
          }
        });
        code.textContent = resolveVars(sql, varInputs);
      });
    } catch (e) { /* not on a Halo tab */ }
  } else {
    varInputs.style.display = 'none';
    varInputs.innerHTML = '';
  }

  let metaHtml = '';
  if (tablesUsed.length) metaHtml += 'Tables: ' + tablesUsed.map(t => `<span class="meta-tag">${escapeHtml(t)}</span>`).join('');
  if (variablesUsed.length) metaHtml += (metaHtml ? ' - ' : '') + 'Variables: ' + variablesUsed.map(v => `<span class="meta-tag">${escapeHtml(v)}</span>`).join('');
  meta.innerHTML = metaHtml;

  copyBtn.textContent = 'Copy';
  copyBtn.classList.remove('copied');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(resolveVars(sql, varInputs)).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
    });
  };

  runBtn.textContent = 'Run';
  runBtn.classList.remove('copied');
  runBtn.onclick = () => {
    const resolved = resolveVars(sql, varInputs);
    const remaining = Object.keys(VAR_LABELS).filter(v => resolved.includes(v));
    if (remaining.length) {
      varInputs.querySelectorAll('.var-input-field').forEach(input => {
        if (!input.value.trim()) input.classList.add('var-input-error');
      });
      return;
    }
    runHaloReport(resolved);
  };

  output.scrollIntoView({ behavior: 'smooth' });
}

function resolveVars(sql, varInputsEl) {
  let resolved = sql;
  if (varInputsEl) {
    varInputsEl.querySelectorAll('.var-input-field').forEach(input => {
      const val = input.value.trim();
      if (val) {
        input.classList.remove('var-input-error');
        resolved = resolved.split(input.dataset.var).join(val);
      }
    });
  }
  return resolved;
}

function runHaloReport(sql) {
  const sqlRunBtn    = document.getElementById('runReportBtn');
  const viewerRunBtn = document.getElementById('runViewerBtn');
  if (!sql) return;

  if (sqlRunBtn) { sqlRunBtn.textContent = 'Running...'; sqlRunBtn.disabled = true; }
  if (viewerRunBtn) { viewerRunBtn.textContent = '...'; viewerRunBtn.disabled = true; }

  try {
    chrome.runtime.sendMessage({
      type: 'RUN_HALO_REPORT',
      data: {
        sql,
        name: `HaloPlus ${viewerState.tableId || 'SQL'}`
      }
    }, (response) => {
      if (sqlRunBtn) sqlRunBtn.disabled = false;
      if (viewerRunBtn) { viewerRunBtn.textContent = 'Run'; viewerRunBtn.disabled = false; }

      if (chrome.runtime.lastError) {
        showViewerError(chrome.runtime.lastError.message);
        if (sqlRunBtn) sqlRunBtn.textContent = 'Run';
        return;
      }

      if (!response?.ok) {
        showViewerError(response?.error || 'Halo did not return report data.');
        if (sqlRunBtn) sqlRunBtn.textContent = 'Run';
        return;
      }

      const rows = extractReportRows(response.data);
      renderRecordRows(rows, response.data);
      showQueryResultHeader(rows.length);
      if (sqlRunBtn) {
        sqlRunBtn.textContent = 'Loaded';
        sqlRunBtn.classList.add('copied');
        setTimeout(() => { sqlRunBtn.textContent = 'Run'; sqlRunBtn.classList.remove('copied'); }, 1800);
      }
      document.getElementById('sqlOutput').style.display = 'none';
      switchToTab('data-viewer');
      document.getElementById('recordTableWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } catch (e) {
    if (sqlRunBtn) { sqlRunBtn.disabled = false; sqlRunBtn.textContent = 'Run'; }
    if (viewerRunBtn) { viewerRunBtn.disabled = false; viewerRunBtn.textContent = 'Run'; }
    showViewerError('Open Halo in the active tab, then run the report again.');
  }
}

function extractReportRows(payload) {
  if (!payload) return [];

  // Flat array of rows returned directly
  if (Array.isArray(payload) && looksLikeRows(payload, '')) return payload;

  // Array-wrapped report object: [{rows: [...]}, ...]
  if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object') {
    const directKeys = ['rows', 'data', 'result', 'results', 'reportdata', 'report_data'];
    for (const key of directKeys) {
      if (Array.isArray(payload[0][key]) && looksLikeRows(payload[0][key], key)) return payload[0][key];
    }
  }

  const directKeys = ['rows', 'data', 'result', 'results', 'reportdata', 'report_data'];
  for (const key of directKeys) {
    if (Array.isArray(payload[key]) && looksLikeRows(payload[key], key)) return payload[key];
  }

  let best = { rows: [], score: 0 };
  const visit = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      const score = scoreReportRows(value, path);
      if (score > best.score) best = { rows: value, score };
      value.slice(0, 20).forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
  };
  visit(payload);
  return best.rows;
}

function looksLikeRows(value, path = '') {
  if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') return false;
  if (isMetadataPath(path)) return false;
  const keys = Object.keys(value[0]);
  if (!keys.length) return false;
  return !isMetadataRow(keys);
}

function scoreReportRows(value, path) {
  if (!looksLikeRows(value, path)) return 0;

  const keys = Object.keys(value[0]);
  const expected = getExpectedViewerResultKeys();
  const matches = keys.filter(key => expected.has(key.toLowerCase())).length;
  const dataValueCount = keys.filter(key => !/^(id|guid|name|type)$/i.test(key)).length;

  return value.length + (matches * 100) + (dataValueCount * 2);
}

function getExpectedViewerResultKeys() {
  if (!viewerState.tableId || !TABLES[viewerState.tableId]) return new Set();

  const table = TABLES[viewerState.tableId];
  const keys = getViewerColumns(viewerState.tableId).flatMap(({ name, col }) => [
    name,
    col.label,
    col.label.replace(/\s+/g, ''),
    col.label.replace(/[^a-z0-9]/gi, '')
  ]);

  Object.entries(table.columns).forEach(([name, col]) => {
    keys.push(name, col.label);
  });

  return new Set(keys.map(key => String(key).toLowerCase()));
}

function isMetadataPath(path) {
  return /(permission|filterable|available_columns|conditions|joins|series|chart|report\.permissions)/i.test(path);
}

function isMetadataRow(keys) {
  const lowerKeys = keys.map(key => key.toLowerCase());
  const metadataKeys = [
    'query',
    'sys_name',
    'table_joins',
    'data_type_group',
    'permissions_agent',
    'readonly',
    'agent_id',
    'agent_name'
  ];

  if (lowerKeys.includes('agent_id') && lowerKeys.includes('readonly')) return true;
  if (lowerKeys.includes('sys_name') && lowerKeys.includes('query')) return true;
  if (lowerKeys.includes('name') && lowerKeys.includes('data_type') && lowerKeys.includes('data_type_group')) return true;
  return metadataKeys.filter(key => lowerKeys.includes(key)).length >= 2;
}

function showQueryResultHeader(rowCount) {
  const bar = document.getElementById('resultsInfoBar');
  if (bar) bar.style.display = '';
  const sub = document.getElementById('resultsInfoSub');
  if (sub) sub.textContent = `${rowCount} row${rowCount !== 1 ? 's' : ''} returned`;
  const sqlBtn = document.getElementById('viewerSqlBtn');
  if (sqlBtn) sqlBtn.style.display = '';
  const exportWrap = document.getElementById('exportWrap');
  if (exportWrap) exportWrap.style.display = rowCount > 0 ? '' : 'none';
}

function renderRecordRows(rows, rawPayload) {
  const wrap = document.getElementById('recordTableWrap');
  wrap.innerHTML = '';
  viewerState.lastRows = rows;
  viewerState.currentPage = 1;

  const paginationEl = document.getElementById('viewerPagination');
  if (paginationEl) paginationEl.style.display = 'none';

  if (!rows.length) {
    const empty = el('div', { class: 'empty-state compact' });
    empty.innerHTML = '<div class="es-text">Halo responded, but no record rows were found. Open DevTools for the side panel and check the HaloPlus report response log.</div>';
    wrap.appendChild(empty);
    console.debug('HaloPlus report response', rawPayload);
    return;
  }

  const columns = Object.keys(rows[0]);
  const tableEl = el('table', { class: 'record-table live-records' });
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach(column => {
    const th = el('th');
    th.innerHTML = `<span class="rt-label">${escapeHtml(column)}</span>`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  tableEl.appendChild(thead);

  const tbody = el('tbody');
  tbody.id = 'recordTableBody';
  tableEl.appendChild(tbody);
  wrap.appendChild(tableEl);

  displayPagedRows();
}

function displayPagedRows() {
  const rows = viewerState.lastRows;
  if (!rows.length) return;

  const tbody = document.getElementById('recordTableBody');
  if (!tbody) return;

  const { currentPage, pageSize } = viewerState;
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);
  const pageRows = rows.slice(start, end);

  const columns = Object.keys(rows[0]);
  const viewerCols = viewerState.tableId ? getViewerColumns(viewerState.tableId) : [];
  const pkViewerCol = viewerCols.find(vc => vc.col.pk);
  const tableRoute = TABLE_ROUTES[viewerState.tableId];
  const canNavigate = !!(pkViewerCol && tableRoute);

  tbody.innerHTML = '';
  pageRows.forEach(row => {
    const tr = el('tr');
    if (canNavigate) {
      const pkValue = row[pkViewerCol.col.label];
      if (pkValue != null && pkValue !== '') {
        tr.classList.add('clickable-row');
        tr.title = `Open record ${pkValue}`;
        tr.addEventListener('click', () => navigateHaloRecord(tableRoute(pkValue)));
      }
    }
    columns.forEach(column => {
      const td = el('td');
      td.textContent = formatCell(row[column]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  renderPagination(rows.length, start, end);
}

function renderPagination(total, start, end) {
  const paginationEl = document.getElementById('viewerPagination');
  if (!paginationEl) return;
  paginationEl.style.display = '';

  const { currentPage, pageSize } = viewerState;
  const totalPages = Math.ceil(total / pageSize);
  const prevBtn   = document.getElementById('pagePrevBtn');
  const nextBtn   = document.getElementById('pageNextBtn');
  const indicator = document.getElementById('pageIndicator');

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  if (indicator) indicator.textContent = total === 0 ? '--' : `${start + 1}-${end} of ${total}`;
}

function navigateHaloRecord(path) {
  chrome.runtime.sendMessage({ type: 'HU_NAVIGATE', data: { path } }, () => {});
}

function exportRows(format) {
  const rows = viewerState.lastRows || [];
  if (!rows.length) return;

  const baseName = `haloutils-${viewerState.tableId || 'records'}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'json') {
    downloadText(`${baseName}.json`, JSON.stringify(rows, null, 2), 'application/json');
    return;
  }
  if (format === 'csv') {
    downloadText(`${baseName}.csv`, rowsToCsv(rows), 'text/csv;charset=utf-8');
    return;
  }
  if (format === 'xlsx') {
    const xlsxData = rowsToXlsx(rows);
    const blob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${baseName}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function rowsToCsv(rows) {
  const columns = getExportColumns(rows);
  const lines = [columns.map(csvCell).join(',')];
  rows.forEach(row => {
    lines.push(columns.map(column => csvCell(row[column])).join(','));
  });
  return lines.join('\r\n');
}


const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipFiles(files) {
  const enc = new TextEncoder();
  const entries = [];
  let localOffset = 0;
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name);
    const dataBytes = enc.encode(content);
    entries.push({ nameBytes, dataBytes, crc: crc32(dataBytes), offset: localOffset });
    localOffset += 30 + nameBytes.length + dataBytes.length;
  }
  const cdOffset = localOffset;
  const cdSize = entries.reduce((s, e) => s + 46 + e.nameBytes.length, 0);
  const buf = new Uint8Array(cdOffset + cdSize + 22);
  let p = 0;
  const w16 = v => { buf[p]=v&255; buf[p+1]=(v>>8)&255; p+=2; };
  const w32 = v => { buf[p]=v&255; buf[p+1]=(v>>8)&255; buf[p+2]=(v>>16)&255; buf[p+3]=(v>>24)&255; p+=4; };
  const wb  = a => { buf.set(a, p); p+=a.length; };

  for (const { nameBytes: n, dataBytes: d, crc } of entries) {
    w32(0x04034b50); w16(20); w16(0); w16(0); w16(0); w16(0);
    w32(crc); w32(d.length); w32(d.length); w16(n.length); w16(0);
    wb(n); wb(d);
  }
  for (const { nameBytes: n, dataBytes: d, crc, offset } of entries) {
    w32(0x02014b50); w16(20); w16(20); w16(0); w16(0); w16(0); w16(0);
    w32(crc); w32(d.length); w32(d.length);
    w16(n.length); w16(0); w16(0); w16(0); w16(0); w32(0); w32(offset);
    wb(n);
  }
  w32(0x06054b50); w16(0); w16(0); w16(entries.length); w16(entries.length);
  w32(cdSize); w32(cdOffset); w16(0);
  return buf;
}

function xlsxColRef(n) {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

function xlsxEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function buildXlsxSheet(rows, columns) {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
  xml += '<row r="1">' + columns.map((col, ci) =>
    `<c r="${xlsxColRef(ci)}1" t="inlineStr"><is><t>${xlsxEsc(col)}</t></is></c>`
  ).join('') + '</row>';
  rows.forEach((row, ri) => {
    const rowNum = ri + 2;
    xml += `<row r="${rowNum}">` + columns.map((col, ci) => {
      const val = formatCell(row[col]);
      const num = Number(val);
      const ref = `${xlsxColRef(ci)}${rowNum}`;
      if (val !== '' && !isNaN(num) && isFinite(num)) return `<c r="${ref}"><v>${num}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xlsxEsc(val)}</t></is></c>`;
    }).join('') + '</row>';
  });
  return xml + '</sheetData></worksheet>';
}

function rowsToXlsx(rows) {
  const columns = getExportColumns(rows);
  return zipFiles([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', buildXlsxSheet(rows, columns)],
  ]);
}

function getExportColumns(rows) {
  return [...rows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key));
    return set;
  }, new Set())];
}

function csvCell(value) {
  const text = formatCell(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showViewerError(message) {
  const wrap = document.getElementById('recordTableWrap');
  viewerState.lastRows = [];
  const exportWrap = document.getElementById('exportWrap');
  if (exportWrap) exportWrap.style.display = 'none';
  const pg = document.getElementById('viewerPagination');
  if (pg) pg.style.display = 'none';
  wrap.innerHTML = `
    <div class="empty-state compact error-state">
      <div class="es-text">${escapeHtml(message)}</div>
    </div>
  `;
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function isAllowedNavigationUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('/')) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function setupSearch() {
  const schemaSearch = document.getElementById('schemaSearch');
  if (schemaSearch) {
    schemaSearch.addEventListener('input', (e) => renderSchemaExplorer(e.target.value));
  }
}

function updateContextBadge(ctx) {
  const badge = document.getElementById('contextBadge');
  if (!badge) return;
  if (ctx?.page && ctx.page !== 'unknown') {
    badge.textContent = ctx.page;
    badge.title = `${ctx.platform || 'Halo'} - ${ctx.page} page`;
  } else if (!isHaloTab) {
    badge.textContent = 'off-site';
    badge.title = 'Active tab is not a Halo page';
  } else {
    badge.textContent = '--';
    badge.title = 'Active page context';
  }
}

async function refreshActiveTabState() {
  let activeUrl = '';

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeUrl = tabs?.[0]?.url || '';
  } catch (error) {
    activeUrl = '';
  }

  pageContext = null;

  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'HU_GET_CONTEXT' }, (response) => {
        if (!chrome.runtime.lastError && response?.ok && response.data) {
          pageContext = response.data;
        }
        resolve();
      });
    });
  } catch (error) {
    pageContext = null;
  }

  isHaloTab = Boolean(pageContext) || isHaloUrl(activeUrl);

  if (!isHaloTab) {
    updateContextBadge(null);
    applyHaloAvailability();
    return;
  }

  updateContextBadge(pageContext);
  applyHaloAvailability();
}

function isHaloUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return HALO_HOST_PATTERN.test(parsed.hostname) || customMatchesIncludeUrl(customHaloMatches, parsed.href);
  } catch (error) {
    return false;
  }
}

function applyHaloAvailability() {
  const haloTabNames = ['data-viewer', 'sql-helper', 'utilities'];
  const note = document.getElementById('nonHaloNotice');
  const noteBody = document.getElementById('nonHaloNoticeBody');
  const regrantBtn = document.getElementById('regrantDomainsBtn');
  const utilityStatus = document.getElementById('utilityStatus');

  haloTabNames.forEach((tabName) => {
    const tabButton = document.querySelector(`.tab[data-tab="${tabName}"]`);
    const tabPanel = document.getElementById(`tab-${tabName}`);
    tabButton?.classList.toggle('hidden-when-no-halo', !isHaloTab);
    tabPanel?.classList.toggle('hidden-when-no-halo', !isHaloTab);
  });

  if (!isHaloTab && !document.getElementById('tab-settings')?.classList.contains('active')) {
    switchToTab('settings');
  }

  if (note) note.style.display = isHaloTab ? 'none' : 'block';
  if (utilityStatus && !isHaloTab) {
    utilityStatus.textContent = 'Open a Halo tab to use HaloPlus utilities.';
  }

  if (!isHaloTab && noteBody && regrantBtn && customHaloMatches.length) {
    checkCustomDomainPermission(customHaloMatches).then(granted => {
      const labels = customHaloMatches
        .map(m => escapeHtml(m.replace(/^https?:\/\//, '').replace(/\/\*$/, '')))
        .join(', ');
      if (granted) {
        noteBody.innerHTML = '<strong>Halo page not detected.</strong> Open one of your saved custom domains (' + labels +
          ') or a standard HaloITSM / HaloPSA tab. If your custom-domain page is already open but still not detected, refresh it once.';
        regrantBtn.style.display = 'none';
      } else {
        noteBody.innerHTML = '<strong>Custom Halo domain access was revoked.</strong> Your saved domains (' + labels +
          ') need permission re-granted after the extension update. Click below, accept the Chrome prompt, then refresh your Halo tab.';
        regrantBtn.style.display = '';
      }
    }).catch(() => {
      if (regrantBtn) regrantBtn.style.display = 'none';
    });
  } else if (regrantBtn) {
    regrantBtn.style.display = 'none';
  }
}

function checkCustomDomainPermission(matches) {
  if (!matches || !matches.length) return Promise.resolve(true);
  return new Promise(resolve => {
    try {
      chrome.permissions.contains({ origins: matches }, has => resolve(!!has));
    } catch (e) {
      resolve(true);
    }
  });
}

function setupRegrantButton() {
  const btn = document.getElementById('regrantDomainsBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!customHaloMatches.length) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Requesting access…';
    try {
      const granted = await requestHostPermissions(customHaloMatches);
      if (granted) {
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'HU_REGISTER_CUSTOM_DOMAINS' }, () => resolve());
        });
        await refreshActiveTabState();
        btn.textContent = 'Access granted — refresh your Halo tab';
      } else {
        btn.textContent = 'Access not granted. Try again or check Chrome permissions.';
      }
    } catch (e) {
      btn.textContent = 'Error: ' + (e.message || 'Could not re-grant');
    } finally {
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 4000);
    }
  });
}

function listenForContext() {
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'PAGE_CONTEXT' && message.data) {
        pageContext = message.data;
        isHaloTab = true;
        updateContextBadge(pageContext);
        applyHaloAvailability();
      }
    });
  } catch (e) {
    // Not running as extension (dev mode)
  }
}

function isTemplateRelevant(tpl) {
  if (!pageContext) return false;
  const relevantTables = PAGE_RELEVANT_TABLES[pageContext.page] || [];
  if (!relevantTables.length) return false;
  return tpl.tables_used?.some(t => relevantTables.includes(t))
      || tpl.variables_used?.some(v => Object.keys(pageContext.vars || {}).includes(v));
}

function el(tag, attrs = {}, text = '') {
  const element = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => element.setAttribute(k, v));
  if (text) element.textContent = text;
  return element;
}

let customCommands = [];
let editingCommandIndex = null;

async function loadCustomCommandsPanel() {
  const data = await new Promise(r => chrome.storage.local.get(['huCustomCommands'], r));
  customCommands = data.huCustomCommands || [];
}

async function persistCustomCommands() {
  await new Promise(r => chrome.storage.local.set({ huCustomCommands: customCommands }, r));
}

function renderCommandList() {
  const list = document.getElementById('commandList');
  if (!list) return;
  list.innerHTML = '';
  if (!customCommands.length) {
    list.innerHTML = '<div class="cmds-empty">No custom commands yet. Create one to launch it from the palette with /.</div>';
    return;
  }
  customCommands.forEach((cmd, index) => {
    const item = el('div', { class: editingCommandIndex === index ? 'cmd-item is-editing-hidden' : 'cmd-item' });
    const preview = cmd.type === 'sql'
      ? (cmd.sql || '').replace(/\s+/g, ' ').trim().slice(0, 55) + (cmd.sql?.length > 55 ? '...' : '')
      : (cmd.url || '');
    item.innerHTML = `
      <div class="cmd-item-info">
        <span class="cmd-item-title">/${escapeHtml(cmd.title)}</span>
        <span class="cmd-item-sub">${escapeHtml(cmd.subtitle || preview)}</span>
      </div>
      <span class="cmd-item-badge">${escapeHtml(cmd.category || cmd.type)}</span>
      <div class="cmd-item-actions">
        <button class="cmd-item-edit" title="Edit command">Edit</button>
        <button class="cmd-item-del" title="Delete command">&times;</button>
      </div>
    `;
    item.querySelector('.cmd-item-edit').addEventListener('click', () => {
      document.getElementById('addCommandBtn').style.display = 'none';
      showCommandForm(index);
    });
    item.querySelector('.cmd-item-del').addEventListener('click', async () => {
      customCommands.splice(index, 1);
      await persistCustomCommands();
      renderCommandList();
    });
    list.appendChild(item);
  });
}

function showCommandForm(editIndex = null) {
  editingCommandIndex = Number.isInteger(editIndex) ? editIndex : null;
  renderCommandList();
  const form = document.getElementById('commandForm');
  if (!form) return;
  form.style.display = '';
  form.innerHTML = '';
  const isEditing = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < customCommands.length;
  const existing = isEditing ? customCommands[editIndex] : null;

  const wrapper = el('div', { class: 'cmd-form' });
  wrapper.innerHTML = `
    <div class="cmd-form-row">
      <label class="field-label">Command name</label>
      <input id="cmdTitle" type="text" class="input-field" placeholder="e.g. Open Tickets Today" value="${escapeHtml(existing?.title || '')}">
    </div>
    <div class="cmd-form-row">
      <label class="field-label">Description <span style="font-weight:400;color:var(--text-3)">(shown in palette)</span></label>
      <input id="cmdSubtitle" type="text" class="input-field" placeholder="Optional short description" value="${escapeHtml(existing?.subtitle || '')}">
    </div>
    <div class="cmd-form-split">
      <div class="cmd-form-row">
        <label class="field-label">Type</label>
        <select id="cmdType" class="select-field">
          <option value="navigation">Navigation</option>
          <option value="sql">SQL</option>
        </select>
      </div>
      <div class="cmd-form-row">
        <label class="field-label">Category</label>
        <input id="cmdCategory" type="text" class="input-field" list="cmdCategoryList" placeholder="e.g. Finance" value="${escapeHtml(existing?.category || '')}">
        <datalist id="cmdCategoryList">
          <option value="Navigation"><option value="SQL">
          <option value="ITSM"><option value="Finance"><option value="People">
          <option value="Assets"><option value="Config"><option value="Workflow">
        </datalist>
      </div>
    </div>
    <div class="cmd-form-row" id="cmdUrlRow">
      <label class="field-label">URL</label>
      <input id="cmdUrl" type="text" class="input-field" placeholder="/customers?filter=...  or  https://...">
    </div>
    <div class="cmd-form-row" id="cmdSqlRow" style="display:none">
      <label class="field-label">SQL</label>
      <textarea id="cmdSql" class="input-field cmd-sql-area" placeholder="SELECT TOP 50 Faultid, Symptom FROM faults WHERE ..."></textarea>
    </div>
    <div class="cmd-form-actions">
      <button class="btn-small" id="cmdCancelBtn">Cancel</button>
      <button class="btn-primary" id="cmdSaveBtn">Save command</button>
    </div>
  `;
  form.appendChild(wrapper);

  const typeEl = document.getElementById('cmdType');
  const urlRow = document.getElementById('cmdUrlRow');
  const sqlRow = document.getElementById('cmdSqlRow');
  const titleEl = document.getElementById('cmdTitle');
  const subtitleEl = document.getElementById('cmdSubtitle');
  const categoryEl = document.getElementById('cmdCategory');
  const urlEl = document.getElementById('cmdUrl');
  const sqlEl = document.getElementById('cmdSql');
  const saveBtn = document.getElementById('cmdSaveBtn');

  titleEl.value = existing?.title || '';
  subtitleEl.value = existing?.subtitle || '';
  categoryEl.value = existing?.category || '';
  urlEl.value = existing?.url || '';
  sqlEl.value = existing?.sql || '';
  typeEl.value = existing?.type || 'navigation';
  if (isEditing) saveBtn.textContent = 'Save changes';

  const syncTypeUi = () => {
    urlRow.style.display = typeEl.value === 'navigation' ? '' : 'none';
    sqlRow.style.display = typeEl.value === 'sql' ? '' : 'none';
  };

  typeEl.addEventListener('change', syncTypeUi);
  syncTypeUi();

  saveBtn.addEventListener('click', async () => {
    const title = titleEl.value.trim();
    const type = typeEl.value;
    const url = urlEl.value.trim();
    const sql = sqlEl.value.trim();

    if (!title) { titleEl.classList.add('var-input-error'); return; }
    if (type === 'navigation' && !url) { urlEl.classList.add('var-input-error'); return; }
    if (type === 'navigation' && !isAllowedNavigationUrl(url)) {
      urlEl.classList.add('var-input-error');
      urlEl.title = 'Only http(s) URLs or paths starting with / are allowed.';
      return;
    }
    if (type === 'sql' && !sql) { sqlEl.classList.add('var-input-error'); return; }

    const cmd = {
      id: existing?.id || Date.now().toString(),
      title,
      subtitle: subtitleEl.value.trim(),
      type,
      category: categoryEl.value.trim() || (type === 'navigation' ? 'Navigation' : 'SQL'),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (type === 'navigation') cmd.url = url;
    if (type === 'sql') cmd.sql = sql;

    if (isEditing) {
      customCommands.splice(editIndex, 1, cmd);
    } else {
      customCommands.push(cmd);
    }
    await persistCustomCommands();
    editingCommandIndex = null;
    form.style.display = 'none';
    document.getElementById('addCommandBtn').style.display = '';
    renderCommandList();
  });

  document.getElementById('cmdCancelBtn').addEventListener('click', () => {
    editingCommandIndex = null;
    form.style.display = 'none';
    document.getElementById('addCommandBtn').style.display = '';
    renderCommandList();
  });

  titleEl.focus();
}

function setupCommandsSection() {
  loadCustomCommandsPanel().then(renderCommandList);
  document.getElementById('addCommandBtn').addEventListener('click', () => {
    document.getElementById('addCommandBtn').style.display = 'none';
    showCommandForm();
  });
}

async function loadCustomHaloDomains() {
  const data = await new Promise(r => chrome.storage.local.get([CUSTOM_DOMAINS_KEY], r));
  customHaloMatches = Array.isArray(data[CUSTOM_DOMAINS_KEY]) ? data[CUSTOM_DOMAINS_KEY] : [];
  return customHaloMatches;
}

function setupCustomDomainSettings() {
  const input = document.getElementById('customHaloDomains');
  const saveBtn = document.getElementById('saveCustomDomainsBtn');
  const status = document.getElementById('customDomainStatus');
  if (!input || !saveBtn) return;

  loadCustomHaloDomains().then(matches => {
    input.value = matches.map(match => match.replace(/\/\*$/, '')).join('\n');
  });

  saveBtn.addEventListener('click', async () => {
    status.textContent = 'Requesting access...';
    saveBtn.disabled = true;

    try {
      const matches = parseCustomHaloDomainInput(input.value);
      if (!matches.length) {
        await saveCustomHaloDomains([]);
        input.value = '';
        status.textContent = 'Custom domains cleared.';
        return;
      }

      const granted = await requestHostPermissions(matches);
      if (!granted) {
        status.textContent = 'Domain access was not granted.';
        return;
      }

      await saveCustomHaloDomains(matches);
      input.value = matches.map(match => match.replace(/\/\*$/, '')).join('\n');
      status.textContent = `${matches.length} custom domain${matches.length === 1 ? '' : 's'} saved.`;
      await injectIntoActiveCustomDomain(matches);
      await refreshActiveTabState();
    } catch (error) {
      status.textContent = error.message || 'Could not save domains.';
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function saveCustomHaloDomains(matches) {
  customHaloMatches = matches;
  await new Promise(resolve => chrome.storage.local.set({ [CUSTOM_DOMAINS_KEY]: matches }, resolve));
  await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'HU_REGISTER_CUSTOM_DOMAINS' }, () => resolve());
  });
}

function requestHostPermissions(matches) {
  return new Promise(resolve => {
    chrome.permissions.request({ origins: matches }, granted => resolve(Boolean(granted)));
  });
}

function parseCustomHaloDomainInput(value) {
  const seen = new Set();
  return String(value || '')
    .split(/\r?\n|,/)
    .map(normalizeCustomDomainMatch)
    .filter(Boolean)
    .filter(match => {
      if (seen.has(match)) return false;
      seen.add(match);
      return true;
    });
}

function normalizeCustomDomainMatch(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';

  if (/^https?:\/\/\*\.[a-z0-9.-]+$/i.test(raw)) {
    return `${raw.toLowerCase()}/*`;
  }

  if (/^\*\.[a-z0-9.-]+$/i.test(raw)) {
    return `https://${raw.toLowerCase()}/*`;
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch (error) {
    throw new Error(`Invalid domain: ${raw}`);
  }

  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) {
    throw new Error(`Invalid domain: ${raw}`);
  }

  if (parsed.port) {
    throw new Error(`Chrome extensions can't grant access to a specific port. Enter "${parsed.hostname}" without ":${parsed.port}" — Chrome's permission covers the host on any port.`);
  }

  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}/*`;
}

async function injectIntoActiveCustomDomain(matches) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (error) {
    return;
  }

  const tab = tabs?.[0];
  if (!tab?.id || !tab.url || !customMatchesIncludeUrl(matches, tab.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content-script.js']
    });
  } catch (error) {
    // The dynamic content script will run after the tab is refreshed.
  }
}

function customMatchesIncludeUrl(matches, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return false;
  }

  return matches.some(match => {
    const matchUrl = match.replace(/\/\*$/, '');
    const wildcard = matchUrl.match(/^(https?:\/\/)\*\.(.+)$/i);
    if (wildcard) {
      return parsed.protocol === wildcard[1].replace('//', ':') &&
        (parsed.hostname === wildcard[2] || parsed.hostname.endsWith(`.${wildcard[2]}`));
    }

    try {
      const origin = new URL(matchUrl);
      return parsed.protocol === origin.protocol && parsed.hostname === origin.hostname;
    } catch (error) {
      return false;
    }
  });
}

async function loadPreferences() {
  const data = await new Promise(r => chrome.storage.local.get([SETTINGS_KEY], r));
  return Object.assign({
    ticket360Enabled: true,
    auto360: true,
    drawer360Push: false,
    hideHaloSidebar: false,
    doubleClickTechFields: true
  }, data[SETTINGS_KEY] || {});
}

async function savePreferences(prefs) {
  await new Promise(r => chrome.storage.local.set({ [SETTINGS_KEY]: prefs }, r));
}

function setupPreferences() {
  const enabledEl      = document.getElementById('prefTicket360Enabled');
  const auto360El      = document.getElementById('prefAuto360');
  const pushEl         = document.getElementById('prefDrawer360Push');
  const sidebarEl      = document.getElementById('prefHideHaloSidebar');
  const dblClickEl     = document.getElementById('prefDoubleClickTechFields');
  if (!enabledEl || !auto360El || !pushEl || !sidebarEl || !dblClickEl) return;

  const subWrap = document.getElementById('ticket360SubPrefs');
  const applyTicket360Lock = () => {
    if (subWrap) subWrap.hidden = !enabledEl.checked;
  };

  loadPreferences().then(prefs => {
    enabledEl.checked  = prefs.ticket360Enabled !== false;
    auto360El.checked  = !!prefs.auto360;
    pushEl.checked     = !!prefs.drawer360Push;
    sidebarEl.checked  = !!prefs.hideHaloSidebar;
    dblClickEl.checked = prefs.doubleClickTechFields !== false;
    applyTicket360Lock();
  });

  const persist = () => savePreferences({
    ticket360Enabled:      enabledEl.checked,
    auto360:               auto360El.checked,
    drawer360Push:         pushEl.checked,
    hideHaloSidebar:       sidebarEl.checked,
    doubleClickTechFields: dblClickEl.checked,
  });

  enabledEl.addEventListener('change', () => { applyTicket360Lock(); persist(); });
  auto360El.addEventListener('change', persist);
  pushEl.addEventListener('change', persist);
  sidebarEl.addEventListener('change', persist);
  dblClickEl.addEventListener('change', persist);
}

document.addEventListener('DOMContentLoaded', init);


