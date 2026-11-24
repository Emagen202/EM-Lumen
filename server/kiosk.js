// One-file Windows kiosk installer, generated per screen with its permanent player address baked in.
//
// The file is a cmd/PowerShell hybrid: double-clicking it runs the batch header, which re-reads the
// same file and executes the PowerShell part (lines inside <# ... #> are a comment to PowerShell).
// It installs to %ProgramData%\EM-Lumen, starts at every logon, keeps the browser alive and opens
// the display immediately. Running it again simply reinstalls; "uninstall" as an argument removes it.

import fs from 'node:fs';

const TEMPLATE_URL = new URL('./kiosk-installer.template.cmd', import.meta.url);
let template = null;
const ps = (s) => String(s).replace(/'/g, "''");          // single-quoted PowerShell literal
const asciiName = (s) => String(s).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function kioskInstallerFilename(screen) {
  const n = asciiName(screen.name);
  return `EM-Lumen-Kiosk-${screen.id}${n ? '-' + n : ''}.cmd`;
}

export function kioskInstaller({ playerUrl, statusUrl, screenName }) {
  if (!template) template = fs.readFileSync(TEMPLATE_URL, 'utf8');
  return template
    .replaceAll('__PLAYER_URL__', ps(playerUrl))
    .replaceAll('__STATUS_URL__', ps(statusUrl))
    .replaceAll('__SCREEN__', String(screenName).replace(/[^\x20-\x7e]/g, '?'))
    .replace(/\r?\n/g, '\r\n');   // cmd.exe needs CRLF line endings
}
