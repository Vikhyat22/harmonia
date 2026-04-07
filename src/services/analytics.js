import { getGuildHistory, getAllGuildHistory } from './historyStore.js';
import { getMetricsSnapshot } from './metrics.js';
import { getAllQueueSnapshots } from './queue.js';
import { getAllGuildSettings } from './settingsStore.js';

function toCountMap(entries, keyFn) {
  const counts = new Map();

  for (const entry of entries) {
    const key = keyFn(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({ key, count }));
}

export function summarizeHistoryEntries(entries, options = {}) {
  const topLimit = options.topLimit ?? 5;
  const now = Date.now();
  const recentWindowMs = 24 * 60 * 60 * 1000;

  return {
    totalEntries: entries.length,
    last24Hours: entries.filter((entry) => now - new Date(entry.timestamp).getTime() <= recentWindowMs).length,
    outcomes: toCountMap(entries, (entry) => entry.status),
    sources: toCountMap(entries, (entry) => entry.source ?? 'slash'),
    languages: toCountMap(entries, (entry) => entry.languageName).slice(0, topLimit),
    requesters: toCountMap(entries, (entry) => entry.requesterId).slice(0, topLimit),
    recentFailures: entries
      .filter((entry) => entry.status === 'failed')
      .slice(0, topLimit)
  };
}

export async function getGuildAnalytics(guildId, options = {}) {
  const limit = options.limit ?? 50;
  const entries = await getGuildHistory(guildId, limit);
  return {
    guildId,
    summary: summarizeHistoryEntries(entries, options),
    entries
  };
}

export async function getDashboardAnalytics(client, options = {}) {
  const historyEntries = await getAllGuildHistory();
  const settings = await getAllGuildSettings();
  const queue = getAllQueueSnapshots();
  const runtimeMetrics = getMetricsSnapshot();

  return {
    generatedAt: new Date().toISOString(),
    runtimeMetrics,
    guildCount: client.guilds.cache.size,
    discordGatewayConnected: client.isReady(),
    queue: {
      activeGuilds: queue.filter((entry) => entry.current || entry.queued.length > 0).length,
      queuedItems: queue.reduce((sum, entry) => sum + entry.queued.length, 0)
    },
    moderation: {
      allowlistGuilds: settings.filter((entry) => entry.accessMode === 'allowlist').length,
      blockedUsers: settings.reduce((sum, entry) => sum + entry.blockedUserIds.length, 0),
      blockedRoles: settings.reduce((sum, entry) => sum + entry.blockedRoleIds.length, 0),
      allowedUsers: settings.reduce((sum, entry) => sum + entry.allowedUserIds.length, 0),
      allowedRoles: settings.reduce((sum, entry) => sum + entry.allowedRoleIds.length, 0)
    },
    history: summarizeHistoryEntries(historyEntries, options),
    guilds: settings
      .map((entry) => ({
        guildId: entry.guildId,
        accessMode: entry.accessMode,
        blockedUsers: entry.blockedUserIds.length,
        blockedRoles: entry.blockedRoleIds.length,
        allowedUsers: entry.allowedUserIds.length,
        allowedRoles: entry.allowedRoleIds.length,
        autoTtsChannels: entry.autoTtsChannelIds.length
      }))
      .sort((left, right) => left.guildId.localeCompare(right.guildId))
  };
}

export function renderDashboardHtml(dashboard) {
  const topLanguages = dashboard.history.languages
    .map((item) => `<li><strong>${item.key}</strong> <span>${item.count}</span></li>`)
    .join('');
  const topRequesters = dashboard.history.requesters
    .map((item) => `<li><strong>${item.key}</strong> <span>${item.count}</span></li>`)
    .join('');
  const outcomes = dashboard.history.outcomes
    .map((item) => `<li><strong>${item.key}</strong> <span>${item.count}</span></li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harmonia Dashboard</title>
  <style>
    :root { color-scheme: dark; --bg: #0f1116; --panel: #171a21; --muted: #99a3b3; --text: #f3f6fb; --accent: #5ad1a3; --border: #2a3040; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: linear-gradient(180deg, #11151d, #0a0c12); color: var(--text); }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
    h1, h2 { margin: 0 0 12px; }
    p { color: var(--muted); }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 18px; }
    .metric { font-size: 2rem; font-weight: 700; margin-top: 10px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    li:last-child { border-bottom: none; }
    code { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <div class="panel">
      <h1>Harmonia Dashboard</h1>
      <p>Gateway: <strong>${dashboard.discordGatewayConnected ? 'connected' : 'disconnected'}</strong> • Guilds: <strong>${dashboard.guildCount}</strong> • Generated: <strong>${dashboard.generatedAt}</strong></p>
      <p>JSON: <code>/dashboard.json</code> • Health: <code>/health</code></p>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="panel"><h2>Requests</h2><div class="metric">${dashboard.runtimeMetrics.enqueued}</div><p>Enqueued this runtime</p></div>
      <div class="panel"><h2>Completed</h2><div class="metric">${dashboard.runtimeMetrics.completed}</div><p>Completed this runtime</p></div>
      <div class="panel"><h2>History</h2><div class="metric">${dashboard.history.totalEntries}</div><p>Total saved history entries</p></div>
      <div class="panel"><h2>Last 24h</h2><div class="metric">${dashboard.history.last24Hours}</div><p>Entries in last 24 hours</p></div>
      <div class="panel"><h2>Queued</h2><div class="metric">${dashboard.queue.queuedItems}</div><p>Queued items across guilds</p></div>
      <div class="panel"><h2>Allowlist Guilds</h2><div class="metric">${dashboard.moderation.allowlistGuilds}</div><p>Guilds in allowlist mode</p></div>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="panel"><h2>Top Languages</h2><ul>${topLanguages || '<li><span>No data yet</span></li>'}</ul></div>
      <div class="panel"><h2>Top Requesters</h2><ul>${topRequesters || '<li><span>No data yet</span></li>'}</ul></div>
      <div class="panel"><h2>Outcomes</h2><ul>${outcomes || '<li><span>No data yet</span></li>'}</ul></div>
    </div>
  </main>
</body>
</html>`;
}
