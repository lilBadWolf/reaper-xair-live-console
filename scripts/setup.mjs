#!/usr/bin/env node
// Live Console setup: build the page, install it into REAPER, and hook the helper script into REAPER's startup.
//
//   npm run setup                      # first-time install (remembers choices in .setup.json)
//   npm run deploy                     # after code changes: rebuild + copy the page, restart the bridge if its code changed
//
// Options:
//   --reaper <dir>   REAPER resource folder (default: auto — Options > Show REAPER resource path in REAPER)
//   --page <file>    page name in reaper_www_root (default: live-console.html)
//   --deploy-only    skip the __startup.lua step
//   --force          overwrite a page with the same name that wasn't made by Live Console
//   --no-restart     leave a running bridge alone even if its code changed
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAVED = path.join(ROOT, '.setup.json');
const MARK_START = '-- >>> Live Console (managed by `npm run setup`) >>>';
const MARK_END = '-- <<< Live Console <<<';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
let saved = {};
try { saved = JSON.parse(fs.readFileSync(SAVED, 'utf8')); } catch {}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const fail = (m) => { console.error(`\n  \x1b[31m✗ ${m}\x1b[0m\n`); process.exit(1); };

// ---------- 1. find REAPER ----------
function defaultResourceDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'REAPER');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'REAPER');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'REAPER');
}
const res = path.resolve(opt('reaper') || saved.reaper || defaultResourceDir());
const page = opt('page') || saved.page || 'live-console.html';
console.log('\nLive Console setup\n');
if (!fs.existsSync(path.join(res, 'reaper.ini'))) {
  fail(`No REAPER resource folder at:\n    ${res}\n  In REAPER: Options > Show REAPER resource path in explorer/finder, then run:\n    npm run setup -- --reaper "<that folder>"\n  (Portable installs keep it next to reaper.exe / REAPER.app.)`);
}
ok(`REAPER resource folder: ${res}`);

// ---------- 2. build ----------
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'vite'))) fail('Dependencies missing — run `npm install` first.');
const { build } = await import('vite');
await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), logLevel: 'error' });
const built = path.join(ROOT, 'dist', 'live-console.html');
ok('Built dist/live-console.html');

// ---------- 3. install the page ----------
const www = path.join(res, 'reaper_www_root');
fs.mkdirSync(www, { recursive: true });
const target = path.join(www, page);
if (fs.existsSync(target) && !flag('force') && !fs.readFileSync(target, 'utf8').includes('<title>Live Console</title>')) {
  fail(`${target} exists and wasn't made by Live Console.\n  Use --page <other-name>.html, or --force to overwrite it.`);
}
fs.copyFileSync(built, target);
ok(`Installed page: reaper_www_root/${page}`);

// ---------- 3b. a running bridge with older code: have it restart itself ----------
// The bridge restarts by launching a copy of itself, so it keeps REAPER's network permission (see /restart).
{
  const bridgeDir = path.join(ROOT, 'bridge');
  const h = crypto.createHash('sha1');
  for (const f of fs.readdirSync(bridgeDir).filter((f) => f.endsWith('.mjs')).sort()) h.update(f).update(fs.readFileSync(path.join(bridgeDir, f)));
  const code = h.digest('hex').slice(0, 12);
  let port = 8899;
  try { port = JSON.parse(fs.readFileSync(path.join(res, 'LiveConsole', 'bridge-config.json'), 'utf8')).httpPort || port; } catch {}
  const base = `http://127.0.0.1:${port}`;
  const status = () => fetch(`${base}/status`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
  const st = await status();
  if (!st) ok('Bridge not running (REAPER starts it)');
  else if (st.code === code) ok('Bridge is up to date');
  else if (flag('no-restart')) warn('Bridge is running older code: restart it to use the changes (left alone: --no-restart)');
  else {
    const r = await fetch(`${base}/restart`, { method: 'POST', signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (!r || !r.ok) {
      warn(`Bridge is running older code that can't restart itself. Once, by hand: curl -X POST ${base}/quit, then run reaper/live_console.lua from REAPER's Action list`);
    } else {
      let now = null;
      for (let i = 0; i < 25 && now?.code !== code; i++) { await new Promise((r) => setTimeout(r, 200)); now = await status(); }
      if (now?.code === code) ok(`Restarted the bridge (its code changed)${now.mixer?.connected ? '' : ' — not connected to the mixer yet'}`);
      else warn('Asked the bridge to restart, but the new one isn\'t answering yet: check LiveConsole/bridge.log');
    }
  }
}

// ---------- 4. run the helper script at REAPER startup ----------
const lua = path.join(ROOT, 'reaper', 'live_console.lua');
if (!flag('deploy-only')) {
  const startup = path.join(res, 'Scripts', '__startup.lua');
  fs.mkdirSync(path.dirname(startup), { recursive: true });
  const before = fs.existsSync(startup) ? fs.readFileSync(startup, 'utf8') : '';
  const block = [
    MARK_START,
    '-- Publishes FX presets for the Live Console web page and starts its mixer bridge.',
    `local lc = [[${lua}]]`,
    'local f = io.open(lc, "r")',
    'if f then f:close(); dofile(lc) end',
    MARK_END,
  ].join('\n');
  let after;
  const re = new RegExp(`${MARK_START.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&')}[\\s\\S]*?${MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (re.test(before)) after = before.replace(re, block);
  else if (/live_console\.lua/.test(before)) {
    warn('Scripts/__startup.lua already loads a live_console.lua (added by hand) — left unchanged.');
    warn(`Make sure it points to: ${lua}`);
  } else after = `${before}${before && !before.endsWith('\n') ? '\n' : ''}${before ? '\n' : ''}${block}\n`;
  if (after !== undefined && after !== before) {
    if (before) fs.copyFileSync(startup, `${startup}.bak`);
    fs.writeFileSync(startup, after);
    ok(`Added Live Console to Scripts/__startup.lua${before ? ' (previous version saved as __startup.lua.bak)' : ''}`);
  } else if (after !== undefined) ok('Scripts/__startup.lua already set up');
}
fs.writeFileSync(SAVED, JSON.stringify({ reaper: res, page }, null, 2));

// ---------- 5. REAPER web interface ----------
const ini = fs.readFileSync(path.join(res, 'reaper.ini'), 'latin1');
const surfaces = [...ini.matchAll(/^csurf_\d+=HTTP\s+\S+\s+(\d+)\s+'[^']*'\s+'([^']*)'/gm)].map((m) => ({ port: m[1], page: m[2] }));
const mine = surfaces.find((s) => s.page.toLowerCase() === page.toLowerCase());
const ips = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
const host = ips[0] || 'this-computer';

console.log('');
if (mine) {
  ok(`REAPER already serves ${page} on port ${mine.port}`);
  console.log(`\n  Open  http://${host}:${mine.port}/  on any phone, tablet or computer on this network.`);
} else {
  console.log('  One-time step in REAPER:');
  console.log('    Preferences > Control/OSC/web > Add > "Web browser interface"');
  console.log(`      Default interface: ${page}   ·   Port: e.g. 8080   ·   OK`);
  console.log(`\n  Then open  http://${host}:8080/  on any phone, tablet or computer on this network.`);
}
if (!flag('deploy-only')) {
  console.log('\n  Restart REAPER (or run reaper/live_console.lua once from Actions > Load ReaScript) to start the helper.');
  console.log(`  Songs, setlists and the mixer address are stored in: ${path.join(res, 'LiveConsole')}`);
}
console.log('');
