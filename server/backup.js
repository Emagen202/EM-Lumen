import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { log } from './log.js';

/** SQLite only: consistent copy of the database file. (Postgres/Neon has its own point-in-time backups.) */
export function runBackup(tag = 'daily') {
  if (db.dialect !== 'sqlite') throw new Error('File backups are only available with SQLite');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(config.backupDir, `lumen-${tag}-${stamp}.db`);
  db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(config.backupDir).filter(f => f.startsWith(`lumen-${tag}-`)).sort();
  const keep = tag === 'daily' ? config.backupKeep : 5;
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(config.backupDir, f), { force: true });
  log.info(`[backup] ${file}`);
  return file;
}

export function scheduleDailyBackup() {
  let lastDay = '';
  setInterval(() => {
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    if (d.getHours() === 3 && day !== lastDay) {
      lastDay = day;
      try { if (db.dialect === 'sqlite') runBackup('daily'); } catch (e) { log.error('[backup] failed', e); }
    }
  }, 5 * 60e3).unref();
}
