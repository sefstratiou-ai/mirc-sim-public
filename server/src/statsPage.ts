import { StatsData, AIConfig, getAllAIConfigs, getSecondaryPreset, getRecentErrors } from './statsDb';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function renderStatsPage(stats: StatsData, activeConfig: AIConfig | null, adminKey: string): string {
  const configs = getAllAIConfigs();
  const presets = configs.filter(c => c.name.startsWith('preset:'));
  const active = activeConfig || configs.find(c => c.name === 'active') || null;
  const secondaryPreset = getSecondaryPreset();
  const recentErrors = getRecentErrors(50);

  const providerRows = stats.tokens.byProvider.map(p => `
    <tr>
      <td>${esc(p.provider)}</td>
      <td class="num">${fmt(p.inputTokens)}</td>
      <td class="num">${fmt(p.outputTokens)}</td>
      <td class="num">${fmt(p.total)}</td>
      <td class="num">${fmt(p.calls)}</td>
    </tr>
  `).join('');

  const requestTypeRows = stats.tokens.byRequestType.map(entry => `
    <tr>
      <td>${esc(entry.requestType)}</td>
      <td class="num">${fmt(entry.inputTokens)}</td>
      <td class="num">${fmt(entry.outputTokens)}</td>
      <td class="num">${fmt(entry.total)}</td>
      <td class="num">${fmt(entry.calls)}</td>
      <td class="num">${fmt(entry.avgInput)}</td>
    </tr>
  `).join('');

  const maskKey = (key: string) => key ? `***${key.slice(-6)}` : '(none)';

  const presetCards = presets.map(p => {
    const label = p.name.replace('preset:', '');
    const displayLabel = label === 'lmstudio' ? 'LM Studio' : label.charAt(0).toUpperCase() + label.slice(1);
    const isActive = active && active.provider === p.provider && active.model === p.model && active.apiKey === p.apiKey;
    const isSecondary = secondaryPreset === label;
    return `
    <div class="preset-card ${isActive ? 'preset-active' : ''} ${isSecondary ? 'preset-secondary' : ''}" id="preset-${esc(label)}">
      <div class="preset-header">
        <span class="preset-label">${esc(displayLabel)}</span>
        <div style="display:flex;gap:4px;align-items:center">
          ${isActive ? '<span class="preset-badge">ACTIVE</span>' : ''}
          ${isSecondary ? '<span class="preset-badge preset-badge-secondary">SECONDARY</span>' : ''}
        </div>
      </div>
      <div class="preset-details">
        <div><span class="cfg-key">Provider:</span> ${esc(p.provider)}</div>
        <div><span class="cfg-key">Model:</span> ${esc(p.model || '(default)')}</div>
        <div><span class="cfg-key">API Key:</span> <span class="mono">${maskKey(p.apiKey)}</span></div>
        ${p.provider === 'lmstudio' ? `<div><span class="cfg-key">URL:</span> ${esc(p.lmstudioUrl)}</div>` : ''}
        <div><span class="cfg-key">Temperature:</span> ${p.temperature}</div>
        ${p.reasoningEffort ? `<div><span class="cfg-key">Reasoning:</span> ${esc(p.reasoningEffort)}</div>` : ''}
      </div>
      <div class="preset-actions">
        <button class="btn btn-apply" onclick="applyPreset('${esc(label)}')">Apply</button>
        <button class="btn btn-edit-preset" onclick="editPreset('${esc(label)}')">Edit</button>
        ${isSecondary
          ? `<button class="btn btn-cancel" onclick="clearSecondary()">Clear Secondary</button>`
          : `<button class="btn btn-secondary" onclick="setSecondary('${esc(label)}')">Set Secondary</button>`
        }
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>mIRC-Sim Admin Stats</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 24px;
      max-width: 960px;
      margin: 0 auto;
    }
    h1 {
      color: #00d4ff;
      font-size: 22px;
      margin-bottom: 6px;
    }
    .subtitle {
      color: #888;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .card {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 16px;
    }
    .card .label {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .card .value {
      font-size: 28px;
      font-weight: bold;
      color: #00d4ff;
      font-family: 'Consolas', 'Courier New', monospace;
    }
    .card .detail {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    h2 {
      color: #e94560;
      font-size: 16px;
      margin-bottom: 12px;
      border-bottom: 1px solid #0f3460;
      padding-bottom: 6px;
    }
    h3 {
      color: #e94560;
      font-size: 16px;
      margin-bottom: 12px;
      margin-top: 12px;
      border-bottom: 1px solid #0f3460;
      padding-bottom: 6px;
    }  
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
    }
    th {
      text-align: left;
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      padding: 8px 12px;
      border-bottom: 1px solid #0f3460;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #0f3460;
      font-size: 14px;
    }
    td.num {
      font-family: 'Consolas', 'Courier New', monospace;
      text-align: right;
    }
    .active-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #4caf50;
      border-radius: 50%;
      margin-right: 6px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── AI Config section ── */
    .ai-section {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 28px;
    }
    .ai-section h2 {
      margin-bottom: 16px;
      border-bottom: none;
      padding-bottom: 0;
    }
    .config-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 20px;
      margin-bottom: 16px;
    }
    .config-form .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .config-form .form-group.full-width {
      grid-column: 1 / -1;
    }
    .config-form label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .config-form input,
    .config-form select {
      background: #0d1b2a;
      border: 1px solid #1b3a5c;
      border-radius: 4px;
      color: #e0e0e0;
      padding: 8px 10px;
      font-size: 13px;
      font-family: 'Consolas', 'Courier New', monospace;
      outline: none;
      transition: border-color 0.2s;
    }
    .config-form input:focus,
    .config-form select:focus {
      border-color: #00d4ff;
    }
    .config-form select {
      font-family: 'Segoe UI', sans-serif;
      cursor: pointer;
    }
    .btn {
      padding: 7px 16px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-save {
      background: #00d4ff;
      color: #0d1b2a;
    }
    .btn-save:hover { background: #33dfff; }
    .btn-apply {
      background: #4caf50;
      color: #fff;
    }
    .btn-apply:hover { background: #66bb6a; }
    .btn-edit-preset {
      background: transparent;
      color: #888;
      border: 1px solid #333;
    }
    .btn-edit-preset:hover { border-color: #00d4ff; color: #00d4ff; }
    .btn-cancel {
      background: transparent;
      color: #888;
      border: 1px solid #333;
    }
    .btn-cancel:hover { border-color: #e94560; color: #e94560; }
    .btn-secondary {
      background: transparent;
      color: #888;
      border: 1px solid #333;
    }
    .btn-secondary:hover { border-color: #ff9800; color: #ff9800; }
    .preset-badge-secondary {
      background: #ff9800 !important;
      color: #000 !important;
    }
    .preset-card.preset-secondary {
      border-color: #ff9800;
      box-shadow: 0 0 15px rgba(255, 152, 0, 0.15);
    }

    .form-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    /* Presets */
    .presets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 16px;
    }
    .preset-card {
      background: #0d1b2a;
      border: 1px solid #1b3a5c;
      border-radius: 6px;
      padding: 14px;
      transition: border-color 0.2s;
    }
    .preset-card:hover { border-color: #00d4ff44; }
    .preset-card.preset-active {
      border-color: #4caf50;
      box-shadow: 0 0 15px rgba(76, 175, 80, 0.15);
    }
    .preset-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .preset-label {
      font-weight: 700;
      font-size: 14px;
      color: #00d4ff;
    }
    .preset-badge {
      background: #4caf50;
      color: #fff;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .preset-details {
      font-size: 12px;
      color: #999;
      line-height: 1.8;
      margin-bottom: 10px;
    }
    .cfg-key {
      color: #666;
    }
    .mono {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 11px;
    }
    .preset-actions {
      display: flex;
      gap: 8px;
    }

    /* Toast */
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      z-index: 9999;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.success { background: #4caf50; color: #fff; }
    .toast.error { background: #e94560; color: #fff; }

    /* Edit preset modal overlay */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.show { display: flex; }
    .modal {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 24px;
      width: 420px;
      max-width: 90vw;
    }
    .modal h3 {
      color: #00d4ff;
      margin-bottom: 16px;
    }
    .modal .config-form {
      grid-template-columns: 1fr;
    }

    /* Error section */
    .error-row-details {
      display: none;
      padding: 8px 12px;
      background: #0d1b2a;
      border-bottom: 1px solid #0f3460;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
      color: #999;
      font-family: 'Consolas', 'Courier New', monospace;
    }
    .error-row-details.show { display: table-row; }
    .error-toggle { cursor: pointer; color: #00d4ff; text-decoration: underline; }
    .error-toggle:hover { color: #33dfff; }
  </style>
</head>
<body>
  <h1>mIRC-Sim Stats</h1>
  <div class="subtitle">Auto-refreshes every 60 seconds &bull; ${new Date().toUTCString()}</div>

  <!-- ── AI Configuration ── -->
  <div class="ai-section">
    <h2>⚡ AI Configuration</h2>
    <div class="config-form" id="activeConfigForm">
      <div class="form-group">
        <label for="cfg-provider">Provider</label>
        <select id="cfg-provider" onchange="onProviderChange()">
          <option value="gemini" ${active?.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
          <option value="openai" ${active?.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="deepseek" ${active?.provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
          <option value="lmstudio" ${active?.provider === 'lmstudio' ? 'selected' : ''}>LM Studio (Local)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="cfg-model">Model</label>
        <input id="cfg-model" type="text" value="${esc(active?.model || '')}" placeholder="Leave blank for provider default">
      </div>
      <div class="form-group" id="apiKeyGroup">
        <label for="cfg-apikey">API Key</label>
        <input id="cfg-apikey" type="password" value="${esc(active?.apiKey || '')}" placeholder="Enter API key...">
      </div>
      <div class="form-group" id="lmUrlGroup" style="display:${active?.provider === 'lmstudio' ? 'flex' : 'none'}">
        <label for="cfg-lmurl">LM Studio URL</label>
        <input id="cfg-lmurl" type="text" value="${esc(active?.lmstudioUrl || 'http://localhost:1234')}" placeholder="http://host:port">
      </div>
      <div class="form-group">
        <label for="cfg-temp">Temperature</label>
        <input id="cfg-temp" type="number" min="0" max="2" step="0.05" value="${active?.temperature ?? 0.9}">
      </div>
      <div class="form-group">
        <label for="cfg-reasoning">Reasoning Effort</label>
        <select id="cfg-reasoning">
          <option value="" ${!active?.reasoningEffort ? 'selected' : ''}>(none)</option>
          <option value="low" ${active?.reasoningEffort === 'low' ? 'selected' : ''}>Low</option>
          <option value="medium" ${active?.reasoningEffort === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high" ${active?.reasoningEffort === 'high' ? 'selected' : ''}>High</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-save" onclick="saveActiveConfig()">Save &amp; Apply</button>
      <span id="saveStatus" style="font-size:12px;color:#666;"></span>
    </div>

    <h2 style="margin-top:24px;">Presets</h2>
    <div class="presets-grid">
      ${presetCards}
    </div>
  </div>

  <!-- ── Edit Preset Modal ── -->
  <div class="modal-overlay" id="presetModal">
    <div class="modal">
      <h3 id="modalTitle">Edit Preset</h3>
      <div class="config-form">
        <div class="form-group">
          <label for="pm-provider">Provider</label>
          <select id="pm-provider" onchange="onModalProviderChange()">
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="lmstudio">LM Studio (Local)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="pm-model">Model</label>
          <input id="pm-model" type="text" placeholder="Leave blank for default">
        </div>
        <div class="form-group" id="pm-apikey-group">
          <label for="pm-apikey">API Key</label>
          <input id="pm-apikey" type="password" placeholder="Enter API key...">
        </div>
        <div class="form-group" id="pm-lmurl-group" style="display:none;">
          <label for="pm-lmurl">LM Studio URL</label>
          <input id="pm-lmurl" type="text" placeholder="http://host:port">
        </div>
        <div class="form-group">
          <label for="pm-temp">Temperature</label>
          <input id="pm-temp" type="number" min="0" max="2" step="0.05" value="0.9">
        </div>
        <div class="form-group">
          <label for="pm-reasoning">Reasoning Effort</label>
          <select id="pm-reasoning">
            <option value="">(none)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div class="form-actions" style="margin-top:12px;">
        <button class="btn btn-save" onclick="savePreset()">Save Preset</button>
        <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Active Users</div>
      <div class="value"><span class="active-dot"></span>${fmt(stats.users.activeRecent)}</div>
      <div class="detail">last 60 minutes</div>
    </div>
    <div class="card">
      <div class="label">Total Unique Users</div>
      <div class="value">${fmt(stats.users.totalUnique)}</div>
      <div class="detail">by IP hash</div>
    </div>
    <div class="card">
      <div class="label">Total Tokens</div>
      <div class="value">${fmt(stats.tokens.grandTotal)}</div>
      <div class="detail">${fmt(stats.tokens.totalInput)} in / ${fmt(stats.tokens.totalOutput)} out</div>
    </div>
    <div class="card">
      <div class="label">API Requests</div>
      <div class="value">${fmt(stats.requests.total)}</div>
      <div class="detail">${fmt(stats.requests.today)} today &bull; ${fmt(stats.requests.thisWeek)} this week</div>
    </div>
    <div class="card">
      <div class="label">Total Sessions</div>
      <div class="value">${fmt(stats.sessions.total)}</div>
      <div class="detail">avg ${stats.sessions.avgDurationMinutes != null ? stats.sessions.avgDurationMinutes + ' min' : 'N/A'}</div>
    </div>
    <div class="card">
      <div class="label">API Errors</div>
      <div class="value" style="color:#e94560">${fmt(stats.errors.total)}</div>
      <div class="detail">${fmt(stats.errors.today)} today</div>
    </div>
  </div>

  <h3>Token Usage by Provider</h3>
  ${stats.tokens.byProvider.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Provider</th>
        <th style="text-align:right">Input</th>
        <th style="text-align:right">Output</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Calls</th>
      </tr>
    </thead>
    <tbody>
      ${providerRows}
    </tbody>
  </table>` : '<p style="color:#666">No API calls recorded yet.</p>'}

  <h3>Token Usage by Request Type</h3>
  ${stats.tokens.byRequestType.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Request Type</th>
        <th style="text-align:right">Input</th>
        <th style="text-align:right">Output</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Calls</th>
        <th style="text-align:right">Avg Input</th>
      </tr>
    </thead>
    <tbody>
      ${requestTypeRows}
    </tbody>
  </table>` : '<p style="color:#666">No request-type data recorded yet.</p>'}

  <h3>Active Users (last 60 min)</h3>
  ${stats.activeIPs.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>IP</th>
        <th>Hash</th>
        <th style="text-align:right">Last Seen (UTC)</th>
        <th style="text-align:right">Calls</th>
        <th style="text-align:right">Tokens</th>
      </tr>
    </thead>
    <tbody>
      ${stats.activeIPs.map(ip => `
      <tr>
        <td><code style="font-size:12px">${esc(ip.rawIp)}</code></td>
        <td><code style="color:#00d4ff;font-size:12px">${esc(ip.ipHash)}</code></td>
        <td class="num">${esc(ip.lastSeen)}</td>
        <td class="num">${fmt(ip.calls)}</td>
        <td class="num">${fmt(ip.tokens)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#666">No active users right now.</p>'}

  <h3>API Errors (recent)</h3>
  ${recentErrors.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Time (UTC)</th>
        <th>IP Hash</th>
        <th>Provider</th>
        <th>Model</th>
        <th>Type</th>
        <th>HTTP</th>
        <th>Error</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${recentErrors.map(err => `
      <tr>
        <td style="font-size:12px">${esc(err.createdAt)}</td>
        <td><code style="color:#00d4ff;font-size:12px">${esc(err.ipHash)}</code></td>
        <td>${esc(err.provider)}</td>
        <td style="font-size:12px">${esc(err.model)}</td>
        <td style="font-size:12px">${esc(err.requestType)}</td>
        <td class="num">${err.httpStatus || '-'}</td>
        <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(err.errorMessage)}">${esc(err.errorMessage.slice(0, 100))}</td>
        <td><span class="error-toggle" onclick="toggleErrorDetails(${err.id})">details</span></td>
      </tr>
      <tr class="error-row-details" id="error-details-${err.id}">
        <td colspan="8"><pre style="margin:0;white-space:pre-wrap;word-break:break-all">${esc(err.errorDetails)}</pre></td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#666">No API errors recorded.</p>'}

  <!-- Toast element -->
  <div class="toast" id="toast"></div>

  <script>
    const ADMIN_KEY = '${esc(adminKey)}';
    const KEEP_EXISTING_SECRET_PLACEHOLDER = 'Leave blank to keep current key';

    function showToast(msg, type) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast ' + type + ' show';
      setTimeout(() => { t.className = 'toast'; }, 3000);
    }

    function onProviderChange() {
      const p = document.getElementById('cfg-provider').value;
      document.getElementById('lmUrlGroup').style.display = p === 'lmstudio' ? 'flex' : 'none';
      document.getElementById('apiKeyGroup').style.display = p === 'lmstudio' ? 'none' : 'flex';
    }

    async function saveActiveConfig() {
      const body = {
        provider: document.getElementById('cfg-provider').value,
        model: document.getElementById('cfg-model').value,
        apiKey: document.getElementById('cfg-apikey').value,
        lmstudioUrl: document.getElementById('cfg-lmurl').value,
        temperature: parseFloat(document.getElementById('cfg-temp').value) || 0.9,
        reasoningEffort: document.getElementById('cfg-reasoning').value,
      };
      try {
        const res = await fetch('/admin/ai-config?key=' + ADMIN_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Configuration saved & broadcasted to clients!', 'success');
        document.getElementById('saveStatus').textContent = 'Saved ' + new Date().toLocaleTimeString();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    async function applyPreset(name) {
      if (!confirm('Apply the "' + name + '" preset as the active configuration? This will be pushed to all connected clients.')) return;
      try {
        const res = await fetch('/admin/ai-config/apply-preset?key=' + ADMIN_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: name }),
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Preset "' + name + '" applied!', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    // ── Edit preset modal ──
    let editingPreset = null;
    let editingPresetHasStoredSecret = false;

    function onModalProviderChange() {
      const p = document.getElementById('pm-provider').value;
      document.getElementById('pm-lmurl-group').style.display = p === 'lmstudio' ? 'flex' : 'none';
      document.getElementById('pm-apikey-group').style.display = p === 'lmstudio' ? 'none' : 'flex';
    }

    function editPreset(name) {
      editingPreset = name;
      editingPresetHasStoredSecret = false;
      document.getElementById('modalTitle').textContent = 'Edit Preset: ' + name.charAt(0).toUpperCase() + name.slice(1);

      // Fetch fresh data for the preset
      fetch('/admin/ai-config?key=' + ADMIN_KEY)
        .then(r => r.json())
        .then(configs => {
          const preset = configs.find(c => c.name === 'preset:' + name);
          if (!preset) { showToast('Preset not found', 'error'); return; }
          document.getElementById('pm-provider').value = preset.provider;
          document.getElementById('pm-model').value = preset.model || '';
          editingPresetHasStoredSecret = !!preset.apiKey;
          document.getElementById('pm-apikey').value = '';
          document.getElementById('pm-apikey').placeholder = preset.apiKey ? KEEP_EXISTING_SECRET_PLACEHOLDER : 'Enter API key...';
          document.getElementById('pm-lmurl').value = preset.lmstudioUrl || '';
          document.getElementById('pm-temp').value = preset.temperature;
          document.getElementById('pm-reasoning').value = preset.reasoningEffort || '';
          onModalProviderChange();
          document.getElementById('presetModal').classList.add('show');
        });
    }

    function closeModal() {
      document.getElementById('presetModal').classList.remove('show');
      editingPreset = null;
      editingPresetHasStoredSecret = false;
    }

    async function savePreset() {
      if (!editingPreset) return;
      const apiKeyValue = document.getElementById('pm-apikey').value;
      const config = {
        provider: document.getElementById('pm-provider').value,
        model: document.getElementById('pm-model').value,
        lmstudioUrl: document.getElementById('pm-lmurl').value,
        temperature: parseFloat(document.getElementById('pm-temp').value) || 0.9,
        reasoningEffort: document.getElementById('pm-reasoning').value,
      };
      // If user left API key blank, fetch the current value from the full config
      if (apiKeyValue) {
        config.apiKey = apiKeyValue;
      } else {
        config.apiKey = '';
      }
      try {
        const res = await fetch('/admin/ai-config/save-preset?key=' + ADMIN_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: editingPreset, config }),
        });
        if (!res.ok) throw new Error(await res.text());
        const savedMessage = apiKeyValue
          ? 'Preset "' + editingPreset + '" saved with updated credentials!'
          : editingPresetHasStoredSecret
            ? 'Preset "' + editingPreset + '" saved. Existing credentials were kept.'
            : 'Preset "' + editingPreset + '" saved!';
        showToast(savedMessage, 'success');
        closeModal();
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    // Init visibility
    onProviderChange();

    function toggleErrorDetails(id) {
      const row = document.getElementById('error-details-' + id);
      if (row) row.classList.toggle('show');
    }

    async function setSecondary(name) {
      if (!confirm('Set "' + name + '" as the secondary (failover) preset?')) return;
      try {
        const res = await fetch('/admin/ai-config/secondary?key=' + ADMIN_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: name }),
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Secondary preset set to "' + name + '"', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    async function clearSecondary() {
      if (!confirm('Clear the secondary (failover) preset?')) return;
      try {
        const res = await fetch('/admin/ai-config/clear-secondary?key=' + ADMIN_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Secondary preset cleared', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
  </script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
