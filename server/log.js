import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let currentDay = '';
let stream = null;

function getStream() {
  if (config.isVercel) return null; // Vercel collects console output in its own logs
  const day = new Date().toISOString().slice(0, 10);
  if (day !== currentDay || !stream) {
    try { stream?.end(); } catch {}
    currentDay = day;
    stream = fs.createWriteStream(path.join(config.logDir, `server-${day}.log`), { flags: 'a' });
    stream.on('error', () => { stream = null; });
    try {
      for (const f of fs.readdirSync(config.logDir)) {
        const p = path.join(config.logDir, f);
        if (Date.now() - fs.statSync(p).mtimeMs > 30 * 86400e3) fs.unlinkSync(p);
      }
    } catch {}
  }
  return stream;
}

function write(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${args.map(a => (a instanceof Error ? a.stack : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
  (level === 'ERROR' ? console.error : console.log)(line);
  try { getStream()?.write(line + '\n'); } catch {}
}

export const log = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
};
