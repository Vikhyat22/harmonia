import http from 'http';
import { getDashboardAnalytics, renderDashboardHtml } from './analytics.js';
import { getMetricsSnapshot } from './metrics.js';
import { getHostingInfo, getHostingWarnings } from '../utils/hosting.js';

export function startHealthServer({ client, port = Number(process.env.PORT ?? 3000) }) {
  const server = http.createServer(async (request, response) => {
    if (request.url === '/') {
      const dashboard = await getDashboardAnalytics(client, { topLimit: 6 });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderDashboardHtml(dashboard));
      return;
    }

    if (request.url === '/dashboard.json') {
      const dashboard = await getDashboardAnalytics(client, { topLimit: 10 });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(dashboard));
      return;
    }

    if (request.url !== '/health') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'not_found' }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        wsPing: client.ws.ping,
        guildCount: client.guilds.cache.size,
        discordGatewayConnected: client.isReady(),
        hosting: getHostingInfo(),
        warnings: getHostingWarnings(),
        metrics: getMetricsSnapshot(),
        timestamp: new Date().toISOString()
      })
    );
  });

  server.on('error', (error) => {
    console.error('Health server error:', error);
  });

  server.listen(port, () => {
    console.log(`Health server listening on :${port}`);
  });

  return server;
}
