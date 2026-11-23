// On-prem server entry point (Windows service / Docker / Linux).
import http from 'node:http';
import { config } from './config.js';
import { log } from './log.js';
import { initDb, housekeeping } from './db.js';
import { handler, PKG } from './app.js';
import { startRealtimePing } from './api.js';
import { scheduleDailyBackup } from './backup.js';

const server = http.createServer(handler);
server.keepAliveTimeout = 65000;
server.requestTimeout = 0; // uploads and SSE can be long
server.headersTimeout = 70000;

process.on('uncaughtException', (e) => log.error('[process] uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('[process] unhandledRejection', e));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log.info(`[process] ${sig}, shutting down`); server.close(); setTimeout(() => process.exit(0), 1500).unref(); });

await initDb();
server.listen(config.port, config.host, () => {
  log.info(`EM-Lumen v${PKG.version} listening on ${config.host}:${config.port} — ${config.baseUrl} (db: ${config.dbKind}, media: ${config.mediaKind})`);
  log.info(`SSO: ${config.oidcEnabled ? 'enabled' : 'NOT configured'} · local admin: ${config.localEnabled ? 'enabled' : 'disabled'}`);
  if (!config.oidcEnabled && !config.localEnabled) log.warn('No login method configured! Set OIDC_* or LOCAL_ADMIN_PASSWORD in .env');
});
startRealtimePing();
scheduleDailyBackup();
setInterval(() => housekeeping().catch(e => log.warn('[housekeeping]', e.message)), 3600e3).unref();
