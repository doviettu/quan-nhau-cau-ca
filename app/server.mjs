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
import WebSocket, { WebSocketServer } from 'ws';
import { createClaudeHandler, claudeReady } from '../bridge/claude-bridge.mjs';
import { ObsClient } from './obs.mjs';
import { TikTokSource, normalizeUser, validUser } from './tiktok.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DEFAULTS = {
  port: 8686,
  tikfinityUrl: 'ws://localhost:21213/',
  tiktok: { username: '', on: false },   // kết nối thẳng TikTok LIVE bằng @tên (không cần TikFinity)
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
const LIVE_WS = `ws://127.0.0.1:${PORT}/live-events`;
// nguồn sự kiện game dùng: kết nối thẳng TikTok (qua app) hoặc TikFinity
const eventsUrl = () => config.tiktok.on ? LIVE_WS : config.tikfinityUrl;
const gameUrl = () => `${BASE}/?obs=1&auto=1&clean=1&preset=live&ws=${encodeURIComponent(eventsUrl())}`;
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
const publicConfig = () => ({ game: config.game, claudeReady: claudeReady(), tikfinityUrl: eventsUrl() });

// ---- TikTok LIVE trực tiếp: phát sự kiện tới game qua ws://127.0.0.1:PORT/live-events ----
const tiktok = new TikTokSource();
const liveWss = new WebSocketServer({ noServer: true });
tiktok.on('event', ev => { const m = JSON.stringify(ev); for (const c of liveWss.clients) if (c.readyState === 1) c.send(m); });
tiktok.on('connected', () => console.log(`📡 Đã kết nối TikTok LIVE @${tiktok.username}`));
function tiktokApply() { if (config.tiktok.on && config.tiktok.username) tiktok.start(config.tiktok.username); else tiktok.stop(); }

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
        tiktok: { ...tiktok.status(), on: config.tiktok.on, saved: config.tiktok.username, gameClients: liveWss.clients.size },
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
    if (p === '/api/yt/test') {
      // thử tìm một bài bằng key đã lưu, giống cách game tìm (gửi kèm Referer của trang game)
      const key = String(config.game.ytKey || '').trim();
      if (!key) return json(res, 200, { ok: false, error: 'Chưa có YouTube Data API key – dán key vào ô bên dưới rồi bấm Lưu' });
      const q = String(b.q || 'Diễm xưa karaoke').slice(0, 100);
      const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate&maxResults=3&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
      let r, j;
      try { r = await fetch(u, { headers: { referer: BASE + '/' }, signal: AbortSignal.timeout(10000) }); j = await r.json(); }
      catch (e) { return json(res, 200, { ok: false, error: 'Không gọi được Google: ' + (e.message || e) }); }
      if (!r.ok) {
        const msg = String(j?.error?.message || 'HTTP ' + r.status), reason = String(j?.error?.errors?.[0]?.reason || j?.error?.status || '');
        let hint = '';
        if (/API key not valid|keyInvalid/i.test(msg + reason)) hint = 'Key sai – chép lại key trong Google Cloud Console (APIs & Services → Credentials).';
        else if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(msg + reason)) hint = 'Chưa bật YouTube Data API v3 cho project của key – vào Google Cloud Console → Library → YouTube Data API v3 → Enable.';
        else if (/referer|referrer/i.test(msg)) hint = `Key đang giới hạn trang web – thêm ${BASE}/* vào Website restrictions của key.`;
        else if (/quota/i.test(msg + reason)) hint = 'Hết hạn mức miễn phí hôm nay (~100 lượt tìm) – mai dùng tiếp, hoặc dán link YouTube trực tiếp.';
        return json(res, 200, { ok: false, error: msg, hint });
      }
      const items = (j.items || []).map(x => ({ id: x.id?.videoId, title: String(x.snippet?.title || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') })).filter(x => x.id);
      return json(res, 200, { ok: true, q, items });
    }
    if (p === '/api/tiktok/connect') {
      const u = normalizeUser(b.username);
      if (!validUser(u)) throw new Error('Nhập đúng tên TikTok, ví dụ @tenban');
      config.tiktok = { username: u, on: true }; saveConfig(); tiktokApply();
      broadcast({ type: 'config', config: publicConfig() });
      return json(res, 200, { ok: true, username: u, ws: LIVE_WS });
    }
    if (p === '/api/tiktok/disconnect') {
      config.tiktok.on = false; saveConfig(); tiktokApply();
      broadcast({ type: 'config', config: publicConfig() });
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

server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, BASE); const o = req.headers.origin;
  if (u.pathname !== '/live-events' || (o && o !== BASE && o !== `http://localhost:${PORT}`)) { socket.destroy(); return; }
  liveWss.handleUpgrade(req, socket, head, ws => liveWss.emit('connection', ws, req));
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
   TikTok LIVE     : ${config.tiktok.on ? '@' + config.tiktok.username + ' (kết nối thẳng)' : 'qua TikFinity – hoặc nhập @tên trong bảng điều khiển'}
   Dừng app        : nhấn Ctrl+C trong cửa sổ này
`);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) exec(`open "${BASE}/panel"`);
  tiktokApply();
  if (config.obs.autoConnect) obsConnect().then(() => console.log('🎥 Đã kết nối OBS')).catch(e => console.log('🎥 OBS: ' + e.message));
});
const stop = () => { console.log('\n👋 Đóng quán. Hẹn gặp lại!'); obs.close(); tiktok.stop(); server.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
