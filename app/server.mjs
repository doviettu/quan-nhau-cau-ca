// App "Cậu Cả Live" cho Mac: một máy chủ cục bộ duy nhất
//  - phục vụ game (http://127.0.0.1:8686) để YouTube nhúng chạy được
//  - cầu nối Claude tại /mc (key nằm trên máy, không vào trình duyệt)
//  - bảng điều khiển /panel: trạng thái, lệnh live, cấu hình, OBS
//  - kênh lệnh /api/control (SSE) tới game đang chạy trong OBS
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createClaudeHandler, claudeReady } from '../bridge/claude-bridge.mjs';
import { ObsClient } from './obs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DEFAULTS = {
  port: 8686,
  tikfinityUrl: 'ws://localhost:21213/',
  obs: { url: 'ws://127.0.0.1:4455', password: '', sceneName: 'Cậu Cả Live', vertical: true, autoConnect: true },
  game: { aiOn: true, aiModel: 'claude-haiku-5-5', aiEvery: 20, aiMax: 180, ytKey: '', kMin: 1, kPrio: 30, kMax: 5, botsOn: true, botMin: 20, mgAuto: true, mgEvery: 3, autoOn: true, autoLuckyMin: 8 },
};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
function loadConfig() { try { return merge(DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch { return merge(DEFAULTS, {}); } }
function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 }); }
let config = loadConfig();
if (!fs.existsSync(CONFIG_PATH)) saveConfig();

const PORT = Number(process.env.PORT || config.port || 8686);
const BASE = `http://127.0.0.1:${PORT}`;
const gameUrl = () => `${BASE}/?obs=1&auto=1&clean=1&preset=live&ws=${encodeURIComponent(config.tikfinityUrl)}`;
const claude = createClaudeHandler({ maxPerHour: Math.max(60, Number(config.game.aiMax) || 180) + 60 });
const obs = new ObsClient();

// ---- trạng thái game (do game trong OBS gửi về) & kênh lệnh ----
let gameState = null, gameStateAt = 0;
const controlClients = new Set();
function broadcast(cmd) { const line = `data: ${JSON.stringify(cmd)}\n\n`; for (const res of controlClients) res.write(line); return controlClients.size; }
setInterval(() => { for (const res of controlClients) res.write(': ping\n\n'); }, 15000);

// ---- thăm dò TikFinity ----
let tikProbe = { ok: false, at: 0 };
function probeTikfinity() {
  if (Date.now() - tikProbe.at < 5000) return;
  tikProbe.at = Date.now();
  let ws; try { ws = new WebSocket(config.tikfinityUrl); } catch { tikProbe.ok = false; return; }
  const t = setTimeout(() => { tikProbe.ok = false; ws.terminate(); }, 2000);
  ws.on('open', () => { clearTimeout(t); tikProbe.ok = true; ws.close(); });
  ws.on('error', () => { clearTimeout(t); tikProbe.ok = false; });
}

// ---- OBS ----
let obsStream = { active: false, timecode: '' };
async function obsConnect() { const o = config.obs; await obs.connect(o.url, o.password); }
setInterval(async () => {
  if (!obs.connected) { if (config.obs.autoConnect) obsConnect().catch(() => { }); return; }
  try { obsStream = await obs.streamStatus(); } catch { }
}, 5000);

// ---- tiện ích HTTP ----
const sameOrigin = req => { const o = req.headers.origin; return !o || o === BASE || o === `http://localhost:${PORT}`; };
function json(res, status, obj) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
async function body(req) { let raw = ''; for await (const c of req) { raw += c; if (raw.length > 100_000) throw new Error('quá lớn'); } return raw ? JSON.parse(raw) : {}; }
function sendFile(res, file, type) {
  fs.readFile(file, (err, data) => { if (err) return json(res, 404, { error: 'Không thấy ' + path.basename(file) }); res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(data); });
}
const publicConfig = () => ({ game: config.game, claudeReady: claudeReady(), tikfinityUrl: config.tikfinityUrl });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE); const p = url.pathname;
  try {
    if (p === '/mc') return claude(req, res);
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && p === '/panel') return sendFile(res, path.join(ROOT, 'app', 'panel.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && p === '/api/config') return json(res, 200, publicConfig());
    if (req.method === 'GET' && p === '/api/control') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': ok\n\n'); controlClients.add(res); req.on('close', () => controlClients.delete(res)); return;
    }
    if (req.method === 'GET' && p === '/api/status') {
      probeTikfinity();
      return json(res, 200, {
        claudeReady: claudeReady(), claudeCalls: claude.callsLastHour(), tikfinity: tikProbe.ok, tikfinityUrl: config.tikfinityUrl,
        obs: { connected: obs.connected, err: obs.err, stream: obsStream, url: config.obs.url, sceneName: config.obs.sceneName, vertical: config.obs.vertical, hasPassword: !!config.obs.password },
        game: gameState, gameAge: gameStateAt ? Date.now() - gameStateAt : null, gameClients: controlClients.size,
        gameUrl: gameUrl(), panelUrl: `${BASE}/panel`, config: { game: config.game, tikfinityUrl: config.tikfinityUrl },
      });
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Không có' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'Không được phép' });
    const b = await body(req);
    if (p === '/api/state') { gameState = b; gameStateAt = Date.now(); return json(res, 200, { ok: true }); }
    if (p === '/api/cmd') return json(res, 200, { ok: true, delivered: broadcast(b) });
    if (p === '/api/config') {
      const { game, tikfinityUrl, obs: o } = b;
      if (isObj(game)) config.game = merge(config.game, game);
      if (typeof tikfinityUrl === 'string' && /^wss?:\/\//.test(tikfinityUrl)) config.tikfinityUrl = tikfinityUrl;
      if (isObj(o)) { config.obs = merge(config.obs, o); if (o.url || o.password !== undefined) obs.close(); }
      saveConfig(); broadcast({ type: 'config', config: publicConfig() });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/obs/connect') { await obsConnect(); return json(res, 200, { ok: true }); }
    if (p === '/api/obs/setup') { await obsConnect(); const r = await obs.setupScene(config.obs, gameUrl()); return json(res, 200, { ok: true, ...r }); }
    if (p === '/api/obs/refresh') { await obsConnect(); await obs.refreshGame(); return json(res, 200, { ok: true }); }
    if (p === '/api/obs/stream') {
      await obsConnect();
      if (b.action === 'start') await obs.startStream(); else if (b.action === 'stop') await obs.stopStream(); else throw new Error('action phải là start/stop');
      obsStream = await obs.streamStatus().catch(() => ({ active: b.action === 'start', timecode: '' }));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'Không có' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`\n⚠️  Cổng ${PORT} đang bận – có thể app đã chạy rồi. Mở ${BASE}/panel hoặc tắt cửa sổ Terminal cũ.\n`); process.exit(1); }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`
🍻  CẬU CẢ LIVE đang chạy
   Bảng điều khiển : ${BASE}/panel
   Game cho OBS    : ${gameUrl()}
   Claude MC       : ${claudeReady() ? 'sẵn sàng (key trên máy)' : 'chưa có key – Cậu Cả chạy theo kịch bản có sẵn'}
   Dừng app        : nhấn Ctrl+C trong cửa sổ này
`);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) exec(`open "${BASE}/panel"`);
  if (config.obs.autoConnect) obsConnect().then(() => console.log('🎥 Đã kết nối OBS')).catch(e => console.log('🎥 OBS: ' + e.message));
});
const stop = () => { console.log('\n👋 Đóng quán. Hẹn gặp lại!'); obs.close(); server.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
