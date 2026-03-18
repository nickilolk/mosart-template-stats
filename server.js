/**
 * server.js
 *
 * Configuration via .env:
 *   PORT=3000
 *   LOG_FOLDER=C:\MMLogs
 *   CHANNEL_TEMPLATES=C:\channeltemplate\channeltemplates.xml
 *   USE_POLLING=false
 *   POLLING_INTERVAL=1000
 *   STATS_LOG_DIR=.\stats-logs   (optional, defaults to stats-logs beside server.js)
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const fs         = require('fs');
const { WebSocketServer } = require('ws');
const LogWatcher = require('./watcher');
const { loadChannelTemplates, computeUnused, DEFAULT_PATH } = require('./channelTemplates');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT               = parseInt(process.env.PORT || '3000', 10);
const LOG_FOLDER         = process.env.LOG_FOLDER         || 'C:\\MMLogs';
const CHANNEL_TEMPLATES  = process.env.CHANNEL_TEMPLATES  || DEFAULT_PATH;
const USE_POLLING        = process.env.USE_POLLING === 'true';
const POLLING_INTERVAL   = parseInt(process.env.POLLING_INTERVAL || '1000', 10);
const STATS_LOG_DIR      = path.resolve(process.env.STATS_LOG_DIR || path.join(__dirname, 'stats-logs'));
const MAX_RECENT         = 100;

// ─── ChannelTemplates ─────────────────────────────────────────────────────────

// knownTemplates is Map<UPPER, displayName> or null if file not found
let knownTemplates = null, gallery = null;
function reloadChannelTemplates() {
  const result = loadChannelTemplates(CHANNEL_TEMPLATES);
  if (result) { knownTemplates = result.templates; gallery = result.gallery; }
  else         { knownTemplates = null; gallery = null; }
}
reloadChannelTemplates();

// ─── Stats store ──────────────────────────────────────────────────────────────

let stats = {
  templates:    {},   // { [name]: count }
  totalEvents:  0,
  startTime:    new Date().toISOString(),
  recentEvents: [],
};

let allEvents = [];   // { template, time, hostname } — full history for time-range queries

function resetStats() {
  stats = {
    templates:    {},
    totalEvents:  0,
    startTime:    new Date().toISOString(),
    recentEvents: [],
  };
  allEvents = [];
}

function getTopTemplates(limit = 200) {
  return Object.entries(stats.templates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function getUnused() {
  if (!knownTemplates) return null;  // feature not available
  return computeUnused(knownTemplates, stats.templates);
}

function getFullStats() {
  const unused = getUnused();
  return {
    templates:     getTopTemplates(200),
    totalEvents:   stats.totalEvents,
    startTime:     stats.startTime,
    recentEvents:  stats.recentEvents,
    uniqueCount:   Object.keys(stats.templates).length,
    unusedCount:   unused ? unused.length : null,
    knownCount:    knownTemplates ? knownTemplates.size : null,
  };
}

// ─── Stats log writer ─────────────────────────────────────────────────────────

function writeStatsLog(reason) {
  if (stats.totalEvents === 0) return;  // nothing to write

  try {
    fs.mkdirSync(STATS_LOG_DIR, { recursive: true });
  } catch (err) {
    console.error('[StatsLog] Could not create directory:', err.message);
    return;
  }

  const now       = new Date();
  const pad       = n => String(n).padStart(2, '0');
  const stamp     = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
                  + `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const fileName  = `stats-${stamp}.csv`;
  const filePath  = path.join(STATS_LOG_DIR, fileName);

  const sorted = Object.entries(stats.templates)
    .sort((a, b) => b[1] - a[1]);

  const lines = [
    `# Mosart Template Stats — ${now.toISOString()}`,
    `# Reason: ${reason}`,
    `# Total switches: ${stats.totalEvents}`,
    `# Unique templates: ${sorted.length}`,
    `# Tracking since: ${stats.startTime}`,
    'template,count',
    ...sorted.map(([name, count]) => `"${name.replace(/"/g, '""')}",${count}`),
  ];

  try {
    fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8');
    console.log(`[StatsLog] Written: ${filePath} (${reason}, ${sorted.length} templates)`);
  } catch (err) {
    console.error('[StatsLog] Write failed:', err.message);
  }
}

function scheduleMidnight() {
  const now          = new Date();
  const midnight     = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const msUntil      = midnight - now;
  setTimeout(() => {
    writeStatsLog('midnight');
    scheduleMidnight();
  }, msUntil);
}

// ─── Template hit handler ──────────────────────────────────────────────────────

function onTemplate(templateName, meta) {
  stats.templates[templateName] = (stats.templates[templateName] || 0) + 1;
  stats.totalEvents++;

  const event = {
    template: templateName,
    count:    stats.templates[templateName],
    time:     meta.time || new Date().toISOString(),
    hostname: meta.hostname || null,
    story:    meta.story    || null,
  };

  allEvents.push({ template: event.template, time: event.time, hostname: event.hostname });
  if (allEvents.length > 200000) {
    writeStatsLog('memory-full');
    allEvents.shift();  // guard against unbounded growth
  }

  stats.recentEvents.unshift(event);
  if (stats.recentEvents.length > MAX_RECENT) stats.recentEvents.length = MAX_RECENT;

  broadcast({
    type:        'template_hit',
    event,
    templates:   getTopTemplates(50),
    totalEvents: stats.totalEvents,
    uniqueCount: Object.keys(stats.templates).length,
    unusedCount: getUnused()?.length ?? null,
  });
}

// ─── Filtered stats ───────────────────────────────────────────────────────────

function computeFilteredStats(from, to) {
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs   = to   ? new Date(to).getTime()   : null;

  const filtered = allEvents.filter(e => {
    const t = new Date(e.time).getTime();
    if (fromMs && t < fromMs) return false;
    if (toMs   && t > toMs)   return false;
    return true;
  });

  const templates = {};
  for (const e of filtered) templates[e.template] = (templates[e.template] || 0) + 1;

  const sorted = Object.entries(templates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([name, count]) => ({ name, count }));

  const recentEvents = filtered.slice(-MAX_RECENT).reverse().map(e => ({
    template: e.template,
    time:     e.time,
    hostname: e.hostname,
    count:    templates[e.template],
  }));

  const unused = knownTemplates ? computeUnused(knownTemplates, templates) : null;

  return {
    templates:   sorted,
    totalEvents: filtered.length,
    startTime:   stats.startTime,
    recentEvents,
    uniqueCount: Object.keys(templates).length,
    unusedCount: unused ? unused.length : null,
    knownCount:  knownTemplates ? knownTemplates.size : null,
  };
}

// ─── XML builder ──────────────────────────────────────────────────────────────

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildXml(data) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<templateStats generated="${new Date().toISOString()}" startTime="${xmlEsc(data.startTime)}" totalEvents="${data.totalEvents}" uniqueTemplates="${data.uniqueCount}">`,
    '  <templates>',
    ...data.templates.map(t => `    <template name="${xmlEsc(t.name)}" count="${t.count}" />`),
    '  </templates>',
    '</templateStats>',
  ];
  return lines.join('\n');
}

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/stats', (req, res) => {
  const { from, to } = req.query;
  res.json((from || to) ? computeFilteredStats(from, to) : getFullStats());
});

app.get('/api/unused', (_req, res) => {
  const unused = getUnused();
  if (unused === null) {
    return res.status(503).json({ error: 'ChannelTemplates.xml not loaded', path: CHANNEL_TEMPLATES });
  }
  res.json({
    unused,
    unusedCount: unused.length,
    knownCount:  knownTemplates.size,
    usedCount:   Object.keys(stats.templates).length,
  });
});

app.get('/api/download', (req, res) => {
  const { format = 'json', from, to } = req.query;
  const data = (from || to) ? computeFilteredStats(from, to) : getFullStats();

  if (format === 'xml') {
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="template-stats.xml"');
    res.send(buildXml(data));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="template-stats.json"');
    res.json(data);
  }
});

app.post('/api/reset', (_req, res) => {
  resetStats();
  broadcast({ type: 'reset', ...getFullStats() });
  res.json({ ok: true });
});

app.post('/api/reload-templates', (_req, res) => {
  reloadChannelTemplates();
  res.json({ ok: true, knownCount: knownTemplates ? knownTemplates.size : 0 });
});

function updateEnv(updates) {
  const envPath = path.join(__dirname, '.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf8'); } catch (_) {}
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    content = re.test(content) ? content.replace(re, line) : content + `\n${line}`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

app.post('/api/config', (req, res) => {
  const { logFolder, channelTemplates, usePolling, pollingInterval } = req.body;

  updateEnv({
    LOG_FOLDER:       logFolder,
    CHANNEL_TEMPLATES: channelTemplates,
    USE_POLLING:      String(usePolling),
    POLLING_INTERVAL: String(pollingInterval),
  });

  // Channel templates can be applied immediately without restart
  process.env.CHANNEL_TEMPLATES = channelTemplates;
  reloadChannelTemplates();

  const restartRequired = (
    path.resolve(logFolder) !== path.resolve(LOG_FOLDER) ||
    String(usePolling) !== String(USE_POLLING) ||
    String(pollingInterval) !== String(POLLING_INTERVAL)
  );

  res.json({ ok: true, restartRequired, knownCount: knownTemplates ? knownTemplates.size : 0 });
});

app.get('/api/config', (_req, res) => res.json({
  logFolder:          path.resolve(LOG_FOLDER),
  channelTemplates:   path.resolve(CHANNEL_TEMPLATES),
  templatesLoaded:    knownTemplates !== null,
  knownCount:         knownTemplates ? knownTemplates.size : 0,
  gallery:            gallery || null,
  usePolling:         USE_POLLING,
  pollInterval:       POLLING_INTERVAL,
}));

// ─── WebSocket ────────────────────────────────────────────────────────────────

const server  = http.createServer(app);
const wss     = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'init', ...getFullStats() }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', err => console.error('[WS error]', err.message));
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// ─── Start ────────────────────────────────────────────────────────────────────

const watcher = new LogWatcher(LOG_FOLDER, onTemplate, {
  usePolling:   USE_POLLING,
  pollInterval: POLLING_INTERVAL,
});

watcher.start();

server.listen(PORT, () => {
  console.log('');
  console.log('  Mosart Template Stats');
  console.log('  Dashboard       : http://localhost:' + PORT);
  console.log('  Log folder      : ' + path.resolve(LOG_FOLDER));
  console.log('  ChannelTemplates: ' + path.resolve(CHANNEL_TEMPLATES) +
    (knownTemplates ? ` (${knownTemplates.size} templates)` : ' (NOT FOUND)'));
  console.log('  Stats log dir   : ' + STATS_LOG_DIR);
  console.log('');
  scheduleMidnight();
});
