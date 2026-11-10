// App "Cậu Cả Live" cho Mac: một máy chủ cục bộ duy nhất
//  - phục vụ game (http://127.0.0.1:8686) để YouTube nhúng chạy được
//  - cầu nối Claude tại /mc (key nằm trên máy, không vào trình duyệt)
//  - bảng điều khiển /panel: trạng thái, lệnh live, cấu hình, mở cửa sổ game cho LIVE Studio
//  - kênh lệnh /api/control (SSE) tới cửa sổ game
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile, execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { createClaudeHandler, claudeReady } from '../bridge/claude-bridge.mjs';
import { TikTokSource, normalizeUser, validUser } from './tiktok.mjs';
import { YouTubeSource, parseYouTubeInput } from './youtube.mjs';
import { FacebookSource, parsePage } from './facebook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DEFAULTS = {
  port: 8686,
  tikfinityUrl: 'ws://localhost:21213/',
  tiktok: { username: '', on: false },   // kết nối thẳng TikTok LIVE bằng @tên (không cần TikFinity)
  youtube: { on: false, input: '', key: '', minPoll: 8 },   // chat YouTube Live qua YouTube Data API (key riêng hoặc dùng chung key karaoke)
  facebook: { on: false, page: '' },   // comment Facebook Live qua Graph API; Page token lưu trong Keychain
  notify: { on: true, topic: '', server: 'https://ntfy.sh', idleMin: 10 },   // báo về điện thoại qua app ntfy
  game: { aiOn: true, aiModel: 'claude-haiku-5-5', aiEvery: 20, aiMax: 180, ytKey: '', kMin: 50, kPrio: 180, kMax: 5, botsOn: true, botMin: 20, mgAuto: true, mgEvery: 3, autoOn: true, autoLuckyMin: 8, bgmYt: false, bgmQuery: '', bgmVol: 35, circusAuto: true, circusEvery: 6, mcVoice: true, mcGap: 40, jokeOn: true, jokeEvery: 4, voiceEngine: 'auto', vieneuVoice: 'Trúc Ly' },
};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
function loadConfig() { try { return merge(DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch { return merge(DEFAULTS, {}); } }
function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 }); }
let config = loadConfig();
// đổi mức quà karaoke mặc định cũ (1 xu chốt bài / 30 xu chen hàng) sang 50 / 180 xu
// giọng mặc định đổi sang nữ hào hứng (Trúc Ly) nếu vẫn đang để giọng mặc định cũ
if (config.game.vieneuVoice === 'Hải Đăng' && !config.game.voiceV2) { config.game.vieneuVoice = 'Trúc Ly'; config.game.voiceV2 = true; saveConfig(); }
if (config.game.kMin === 1 && config.game.kPrio === 30 && !config.game.kPriceV2) { config.game.kMin = 50; config.game.kPrio = 180; config.game.kPriceV2 = true; saveConfig(); }
if (config.obs) { delete config.obs; saveConfig(); }
if (!config.notify.topic) { config.notify.topic = 'caucalive-' + crypto.randomBytes(5).toString('hex'); saveConfig(); }
if (!fs.existsSync(CONFIG_PATH)) saveConfig();

const PORT = Number(process.env.PORT || config.port || 8686);
const BASE = `http://127.0.0.1:${PORT}`;
const LIVE_WS = `ws://127.0.0.1:${PORT}/live-events`;
// nguồn sự kiện game dùng: qua app (TikTok trực tiếp, YouTube, Facebook; TikFinity được app chuyển tiếp) hoặc thẳng TikFinity
const appSources = () => config.tiktok.on || config.youtube.on || config.facebook.on;
const eventsUrl = () => appSources() ? LIVE_WS : config.tikfinityUrl;
const gameUrl = () => `${BASE}/?obs=1&auto=1&clean=1&preset=live&ws=${encodeURIComponent(eventsUrl())}`;
const claude = createClaudeHandler({ maxPerHour: Math.max(60, Number(config.game.aiMax) || 180) + 60 });

// ---- trạng thái game (do cửa sổ game gửi về) & kênh lệnh ----
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

// ---- cửa sổ game cho TikTok LIVE Studio (nguồn "Chụp cửa sổ") ----
const CHROME = '/Applications/Google Chrome.app';
function openGameWindow() {
  if (process.platform !== 'darwin') return { ok: false, error: 'Chỉ mở tự động được trên Mac – hãy mở địa chỉ game bằng trình duyệt' };
  const url = gameUrl().replace(/&ws=[^&]*/, '');   // game tự lấy nguồn sự kiện từ app
  if (fs.existsSync(CHROME)) {
    const prof = path.join(process.env.HOME || '', 'Library', 'Application Support', 'CauCaLive', 'chrome');
    exec(`open -na "Google Chrome" --args --app="${url}" --window-size=540,960 --user-data-dir="${prof}" --autoplay-policy=no-user-gesture-required`);
    return { ok: true, chrome: true };
  }
  exec(`open "${url}"`);
  return { ok: true, chrome: false, warning: 'Chưa có Google Chrome nên game mở trong trình duyệt mặc định (có thanh địa chỉ). Cài Chrome để có cửa sổ dọc gọn: brew install --cask google-chrome' };
}

// ---- giọng Cậu Cả: đọc bằng giọng tiếng Việt của macOS (lệnh `say`), tiếng ra loa máy → LIVE Studio thu âm thanh máy tính ----
let viVoice = null, voiceChecked = false, saying = false; const sayQ = [];
function checkVoice() {
  if (process.platform !== 'darwin') { voiceChecked = true; return; }
  execFile('say', ['-v', '?'], (e, out) => {
    voiceChecked = true; if (e) return;
    const line = String(out).split('\n').find(l => /\bvi[_-]VN\b/.test(l));
    viVoice = line ? line.split(/\s{2,}/)[0].trim() : null;
  });
}
// ---- VieNeu-TTS: giọng tiếng Việt tự nhiên chạy trên máy (cài bằng cai-giong-vieneu.command) ----
const VIENEU_HOME = path.join(process.env.HOME || os.homedir(), 'Library', 'Application Support', 'CauCaLive', 'vieneu');
const VIENEU_PY = process.env.VIENEU_PYTHON || path.join(VIENEU_HOME, 'venv', 'bin', 'python');
const VIENEU_PORT = Number(process.env.VIENEU_PORT || 8011);
const vn = { state: 'off', err: '', proc: null, voices: [], restarts: 0, url: `http://127.0.0.1:${VIENEU_PORT}` };
const vnInstalled = () => fs.existsSync(VIENEU_PY);
const vnWanted = () => config.game.voiceEngine !== 'mac' && vnInstalled();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function vnHealth() { try { const r = await fetch(vn.url + '/health', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
async function vnLoadVoices() { try { const j = await (await fetch(vn.url + '/v1/voices', { signal: AbortSignal.timeout(5000) })).json(); vn.voices = (j.data || []).map(v => ({ id: v.id, desc: v.description || '' })); } catch { } }
async function vnStart() {
  if (vn.proc || vn.state === 'starting' || !vnWanted()) return;
  if (await vnHealth()) { vn.state = 'ready'; vnLoadVoices(); return; }   // đã chạy sẵn
  vn.state = 'starting'; vn.err = '';
  fs.mkdirSync(VIENEU_HOME, { recursive: true });
  const logFile = path.join(VIENEU_HOME, 'server.log'), log = fs.openSync(logFile, 'a');
  // vieneu_run.py: tải mô hình vào thư mục thường (không symlink) để ONNX Runtime mới không chặn file .data
  vn.proc = spawn(VIENEU_PY, [path.join(ROOT, 'app', 'vieneu_run.py')], { stdio: ['ignore', log, log],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(VIENEU_PORT), VIENEU_BACKEND: 'onnx', HF_HOME: path.join(VIENEU_HOME, 'hf'), CAUCA_VIENEU_MODELS: path.join(VIENEU_HOME, 'models') } });
  vn.proc.on('exit', code => {
    const wasReady = vn.state === 'ready'; vn.proc = null; if (vn.state === 'off') return;
    vn.state = 'error'; vn.err = `VieNeu dừng (mã ${code}) – xem ${logFile}`; console.log('🗣️ ' + vn.err);
    if (wasReady && vn.restarts < 3) { vn.restarts++; setTimeout(vnStart, 10000); }   // tự khởi động lại, tối đa 3 lần
  });
  console.log('🗣️ Đang khởi động giọng VieNeu (lần đầu có thể mất vài phút)…');
  for (const t0 = Date.now(); Date.now() - t0 < 10 * 60000;) {
    await sleep(2000); if (!vn.proc) return;
    if (await vnHealth()) { vn.state = 'ready'; await vnLoadVoices(); console.log(`🗣️ Giọng VieNeu sẵn sàng (${vn.voices.length} giọng)`); return; }
  }
  vn.state = 'error'; vn.err = 'VieNeu khởi động quá lâu – xem ' + logFile;
}
function vnStop() { const p = vn.proc; vn.state = 'off'; vn.proc = null; try { p && p.kill(); } catch { } }
function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]);
}
async function vnSynth(text) {
  const voice = vn.voices.some(v => v.id === config.game.vieneuVoice) ? config.game.vieneuVoice : undefined;
  const r = await fetch(vn.url + '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: 'vieneu-v3-turbo', input: text, voice, response_format: 'pcm', sample_rate: 24000 }) });
  if (!r.ok) throw new Error('VieNeu HTTP ' + r.status);
  return wavFromPcm(Buffer.from(await r.arrayBuffer()), 24000);
}
let wavN = 0;
function playWav(buf) {
  return new Promise(res => {
    const f = path.join(os.tmpdir(), `caucalive-${process.pid}-${wavN++ % 4}.wav`); fs.writeFileSync(f, buf);
    const player = process.platform === 'darwin' ? 'afplay' : process.env.CAUCA_PLAYER;
    if (!player) return setTimeout(res, Math.round((buf.length - 44) / 48));   // không có trình phát (máy thử): giả thời lượng
    execFile(player, [f], { timeout: 60000 }, () => res());
  });
}
const EMO = /\[(cười|thở dài|hắng giọng)\]/g;   // ký hiệu cảm xúc của VieNeu – giọng Mac thì bỏ đi
function sayMac(t) { const s = t.replace(EMO, ' ').trim(); return s ? new Promise(res => execFile('say', ['-v', viVoice, '-r', '200', s], { timeout: 30000 }, () => res())) : Promise.resolve(); }
let nextWav = null;   // tạo sẵn câu kế tiếp trong lúc đang phát câu trước
async function sayNext() {
  if (saying || !sayQ.length) return;
  saying = true; const t = sayQ.shift();
  try {
    if (vn.state === 'ready') {
      const buf = nextWav && nextWav.t === t ? await nextWav.p : await vnSynth(t); nextWav = null;
      if (sayQ.length) { const n = sayQ[0]; nextWav = { t: n, p: vnSynth(n).catch(() => null) }; }
      if (buf) await playWav(buf); else if (viVoice) await sayMac(t);
    } else if (viVoice) await sayMac(t);
  } catch (e) { vn.err = String(e.message || e); if (viVoice) await sayMac(t); }
  saying = false; sayNext();
}
function speak(text) {
  const useVn = vn.state === 'ready';
  if (!useVn && process.platform !== 'darwin') return { ok: false, error: vn.state === 'starting' ? 'Giọng VieNeu đang khởi động' : 'Chỉ đọc bằng giọng máy trên Mac' };
  if (!useVn && !viVoice) return { ok: false, error: vn.state === 'starting' ? 'Giọng VieNeu đang khởi động' : voiceChecked ? 'Chưa có giọng: chạy cai-giong-vieneu.command (khuyên dùng) hoặc cài giọng Linh của Mac' : 'Đang kiểm tra giọng đọc' };
  const t = String(text || '').replace(/\[(cười|thở dài|hắng giọng)\]/g, '\u0001$1\u0002').replace(/[@#*_`<>\[\]{}|\\]/g, ' ').replace(/\u0001/g, '[').replace(/\u0002/g, ']').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!t) return { ok: false, error: 'Không có nội dung' };
  if (sayQ.length >= 4) sayQ.shift();   // đừng dồn quá: bỏ câu cũ nhất (đủ chỗ cho một câu chuyện nhiều câu)
  sayQ.push(t); sayNext();
  return { ok: true, voice: useVn ? 'VieNeu · ' + (config.game.vieneuVoice || 'mặc định') : viVoice };
}
checkVoice();
vnStart();

// ---- tiện ích HTTP ----
const sameOrigin = req => { const o = req.headers.origin; return !o || o === BASE || o === `http://localhost:${PORT}`; };
function json(res, status, obj) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
async function body(req) { let raw = ''; for await (const c of req) { raw += c; if (raw.length > 100_000) throw new Error('quá lớn'); } return raw ? JSON.parse(raw) : {}; }
function sendFile(res, file, type) {
  fs.readFile(file, (err, data) => { if (err) return json(res, 404, { error: 'Không thấy ' + path.basename(file) }); res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(data); });
}
const publicConfig = () => ({ game: config.game, claudeReady: claudeReady(), tikfinityUrl: eventsUrl(), live: { ok: live.ok, reason: live.reason },
  platforms: { tiktok: config.tiktok.on || !appSources(), youtube: !!config.youtube.on, facebook: !!config.facebook.on } });

// ---- khóa bí mật (Page token Facebook): Keychain trên Mac, tệp riêng quyền 600 ở máy khác ----
const SECRET_FILE = path.join(ROOT, '.secrets.json');
const secretCache = new Map();
function secretGet(name) {
  if (secretCache.has(name)) return secretCache.get(name);
  let v = '';
  if (process.platform === 'darwin') { try { v = String(execFileSync('security', ['find-generic-password', '-s', 'CauCaLive-' + name, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] })).trim(); } catch { } }
  else { try { v = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'))[name] || ''; } catch { } }
  secretCache.set(name, v); return v;
}
function secretSet(name, v) {
  v = String(v || '').trim(); secretCache.set(name, v);
  if (process.platform === 'darwin') {
    try { if (v) execFileSync('security', ['add-generic-password', '-U', '-a', os.userInfo().username, '-s', 'CauCaLive-' + name, '-w', v], { stdio: 'ignore' }); else execFileSync('security', ['delete-generic-password', '-s', 'CauCaLive-' + name], { stdio: 'ignore' }); } catch { }
    return;
  }
  let o = {}; try { o = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')); } catch { }
  if (v) o[name] = v; else delete o[name];
  fs.writeFileSync(SECRET_FILE, JSON.stringify(o), { mode: 0o600 });
}

// ---- báo về điện thoại (ntfy) + thông báo trên Mac ----
async function notify(title, message, priority = 4) {
  console.log(`🔔 ${title}: ${message}`);
  const n = config.notify; if (!n.on) return { ok: false, error: 'Đang tắt báo' };
  if (process.platform === 'darwin') execFile('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Glass"`], () => { });
  if (!n.topic) return { ok: false, error: 'Chưa có mã kênh ntfy' };
  try {
    const r = await fetch(String(n.server || 'https://ntfy.sh').replace(/\/+$/, ''), { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: n.topic, title, message, priority, tags: ['beer'] }), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { ok: true };
  } catch (e) { console.log('🔔 Không gửi được về điện thoại: ' + (e.message || e)); return { ok: false, error: String(e.message || e) }; }
}

// ---- theo dõi phiên live: dừng/mất kết nối → báo điện thoại + ngừng gọi Claude ----
const live = { ok: false, reason: 'chưa kết nối phiên live', since: Date.now(), badSince: 0, everOk: false, alerted: false, lastReal: 0 };
function liveCheck() {
  const t = Date.now(); let ok, reason;
  if (appSources()) {
    // nhiều nền tảng: chỉ cần một nơi còn đang live là quán còn khách
    const bad = [];
    const chk = (on, src, label, relay) => { if (!on) return false; if (src.state === 'live') return true; bad.push(`${label}: ${src.error || (src.state === 'connecting' ? 'đang kết nối' : 'chưa live')}`); return false; };
    const tt = config.tiktok.on ? chk(true, tiktok, 'TikTok') : (tfRelay.ok || (bad.push('TikTok: TikFinity không chạy'), false));
    ok = tt | chk(config.youtube.on, youtube, 'YouTube') | chk(config.facebook.on, facebook, 'Facebook');
    ok = !!ok; reason = ok ? '' : bad.join(' · ');
  }
  else {
    probeTikfinity();
    const fresh = gameState && t - gameStateAt < 10000;
    ok = tikProbe.ok && !!(fresh && gameState.live);
    reason = !tikProbe.ok ? 'TikFinity không chạy' : !fresh ? 'cửa sổ game không chạy' : !gameState.live ? 'game mất kết nối TikFinity' : '';
  }
  const lastReal = Math.max(live.lastReal, (gameState && gameState.lastReal) || 0);
  const idleMs = Math.max(3, Number(config.notify.idleMin) || 10) * 60000;
  if (ok && t - Math.max(lastReal, live.since) > idleMs) { ok = false; reason = `${Math.round(idleMs / 60000)} phút không có sự kiện nào từ người xem`; }
  if (ok) {
    live.badSince = 0;
    if (!live.ok) {
      live.ok = true; live.reason = ''; live.since = t; live.everOk = true;
      broadcast({ type: 'live', ok: true });
      if (live.alerted) { live.alerted = false; notify('▶️ Live chạy lại', 'Phiên live Cậu Cả đã kết nối lại. Claude MC tiếp tục dẫn.', 3); }
    }
    return;
  }
  live.reason = reason;
  if (!live.badSince) live.badSince = t;
  if (live.ok && t - live.badSince >= 30000) {   // chờ 30 giây cho chắc rồi mới coi là dừng
    live.ok = false; live.since = t;
    broadcast({ type: 'live', ok: false, reason });
    if (live.everOk && !live.alerted) { live.alerted = true; notify('⏸ Live Cậu Cả đang dừng', `${reason}. Đã ngưng gọi Claude. Kiểm tra LIVE Studio (captcha, mạng, bị dừng phiên).`, 5); }
  }
}
setInterval(liveCheck, 5000);

// ---- TikTok LIVE trực tiếp: phát sự kiện tới game qua ws://127.0.0.1:PORT/live-events ----
const tiktok = new TikTokSource();
const liveWss = new WebSocketServer({ noServer: true });
const relayEvent = ev => { live.lastReal = Date.now(); const m = JSON.stringify(ev); for (const c of liveWss.clients) if (c.readyState === 1) c.send(m); };
tiktok.on('event', ev => relayEvent(ev));
tiktok.on('connected', () => console.log(`📡 Đã kết nối TikTok LIVE @${tiktok.username}`));
function tiktokApply() { if (config.tiktok.on && config.tiktok.username) tiktok.start(config.tiktok.username); else tiktok.stop(); tfRelayApply(); }
// YouTube Live
const youtube = new YouTubeSource();
youtube.on('event', ev => relayEvent(ev));
youtube.on('connected', () => console.log(`📡 Đã kết nối chat YouTube Live: ${youtube.title || youtube.videoId}`));
const ytKey = () => String(config.youtube.key || config.game.ytKey || '').trim();
function youtubeApply() { if (config.youtube.on && config.youtube.input) youtube.start(config.youtube.input, { getKey: ytKey, referer: BASE + '/', minPoll: config.youtube.minPoll }); else youtube.stop(); tfRelayApply(); }
// Facebook Live
const facebook = new FacebookSource();
facebook.on('event', ev => relayEvent(ev));
facebook.on('connected', () => console.log(`📡 Đã kết nối Facebook Live: ${facebook.pageName} – ${facebook.title || facebook.liveId}`));
function facebookApply() { if (config.facebook.on && secretGet('facebook')) facebook.start(config.facebook.page, { getToken: () => secretGet('facebook') }); else facebook.stop(); tfRelayApply(); }
// Dùng TikFinity cho TikTok nhưng có thêm YouTube/Facebook: app nhận sự kiện TikFinity rồi chuyển tiếp cho game
const tfRelay = { ws: null, ok: false, timer: null, want: false };
function tfRelayApply() {
  const want = !config.tiktok.on && (config.youtube.on || config.facebook.on);
  if (want === tfRelay.want) return; tfRelay.want = want;
  if (want) tfRelayConnect(); else { clearTimeout(tfRelay.timer); try { tfRelay.ws && tfRelay.ws.terminate(); } catch { } tfRelay.ws = null; tfRelay.ok = false; }
}
function tfRelayConnect() {
  if (!tfRelay.want) return;
  let ws; try { ws = new WebSocket(config.tikfinityUrl); } catch { tfRelay.timer = setTimeout(tfRelayConnect, 5000); return; }
  tfRelay.ws = ws;
  ws.on('open', () => { tfRelay.ok = true; });
  ws.on('message', d => { live.lastReal = Date.now(); const m = String(d); for (const c of liveWss.clients) if (c.readyState === 1) c.send(m); });
  ws.on('close', () => { tfRelay.ok = false; if (tfRelay.ws === ws && tfRelay.want) tfRelay.timer = setTimeout(tfRelayConnect, 5000); });
  ws.on('error', () => { });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE); const p = url.pathname;
  try {
    if (p === '/mc') {
      if (!live.ok && req.method === 'POST') return json(res, 503, { error: { status: 503, message: 'Live đang dừng – app tạm ngưng gọi Claude' } });
      return claude(req, res);
    }
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
        tiktok: { ...tiktok.status(), on: config.tiktok.on, saved: config.tiktok.username, gameClients: liveWss.clients.size, relay: tfRelay.want ? tfRelay.ok : null },
        youtube: { ...youtube.status(), on: config.youtube.on, saved: config.youtube.input, minPoll: config.youtube.minPoll, ownKey: !!config.youtube.key, hasKey: !!ytKey() },
        facebook: { ...facebook.status(), on: config.facebook.on, saved: config.facebook.page, hasToken: !!secretGet('facebook') },
        live: { ok: live.ok, reason: live.reason, since: live.since, lastReal: Math.max(live.lastReal, (gameState && gameState.lastReal) || 0) },
        notify: { on: config.notify.on, topic: config.notify.topic, idleMin: config.notify.idleMin },
        voice: { mac: process.platform === 'darwin', name: viVoice, checked: voiceChecked, on: config.game.mcVoice !== false, engine: config.game.voiceEngine || 'auto',
          vieneu: { installed: vnInstalled(), state: vn.state, err: vn.err, voice: config.game.vieneuVoice, voices: vn.voices } },
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
      const { game, tikfinityUrl, notify: nf } = b;
      if (isObj(nf)) { const o = {}; if (typeof nf.on === 'boolean') o.on = nf.on; if (typeof nf.topic === 'string' && /^[\w-]{1,64}$/.test(nf.topic.trim())) o.topic = nf.topic.trim(); if (Number(nf.idleMin) >= 3) o.idleMin = Math.min(120, Number(nf.idleMin)); config.notify = merge(config.notify, o); }
      if (isObj(game)) { const prevEng = config.game.voiceEngine; config.game = merge(config.game, game); if (config.game.voiceEngine !== prevEng) { if (config.game.voiceEngine === 'mac') vnStop(); else vnStart(); } }
      if (typeof tikfinityUrl === 'string' && /^wss?:\/\//.test(tikfinityUrl)) config.tikfinityUrl = tikfinityUrl;
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
    if (p === '/api/youtube/connect') {
      const input = String(b.input || '').trim();
      if (!parseYouTubeInput(input)) throw new Error('Nhập link buổi live, link kênh hoặc @tên kênh YouTube');
      const yt = { ...config.youtube, input, on: true };
      if (typeof b.key === 'string' && b.key.trim()) yt.key = b.key.trim();
      if (Number(b.minPoll) >= 5) yt.minPoll = Math.min(60, Number(b.minPoll));
      config.youtube = yt; saveConfig(); youtubeApply();
      broadcast({ type: 'config', config: publicConfig() });
      return json(res, 200, { ok: true, ws: LIVE_WS });
    }
    if (p === '/api/youtube/disconnect') { config.youtube.on = false; saveConfig(); youtubeApply(); broadcast({ type: 'config', config: publicConfig() }); return json(res, 200, { ok: true }); }
    if (p === '/api/facebook/connect') {
      const page = String(b.page || '').trim();
      if (parsePage(page) === null) throw new Error('Tên hoặc ID Trang Facebook không hợp lệ');
      if (typeof b.token === 'string' && b.token.trim()) { if (!/^[\w-]{30,600}$/.test(b.token.trim())) throw new Error('Page access token không đúng dạng'); secretSet('facebook', b.token); }
      if (!secretGet('facebook')) throw new Error('Dán Page access token trước khi kết nối');
      config.facebook = { ...config.facebook, page, on: true }; saveConfig(); facebookApply();
      broadcast({ type: 'config', config: publicConfig() });
      return json(res, 200, { ok: true, ws: LIVE_WS });
    }
    if (p === '/api/facebook/disconnect') { config.facebook.on = false; saveConfig(); facebookApply(); broadcast({ type: 'config', config: publicConfig() }); return json(res, 200, { ok: true }); }
    if (p === '/api/facebook/forget') { secretSet('facebook', ''); config.facebook.on = false; saveConfig(); facebookApply(); broadcast({ type: 'config', config: publicConfig() }); return json(res, 200, { ok: true }); }
    if (p === '/api/notify/test') return json(res, 200, await notify('🍻 Cậu Cả Live', 'Thử thông báo: điện thoại đã nhận được báo từ app.', 3));
    if (p === '/api/speak') return json(res, 200, speak(b.text));
    if (p === '/api/window/open') return json(res, 200, openGameWindow());
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
   Địa chỉ game    : ${gameUrl()}
   Claude MC       : ${claudeReady() ? 'sẵn sàng (key trên máy)' : 'chưa có key – Cậu Cả chạy theo kịch bản có sẵn'}
   TikTok LIVE     : ${config.tiktok.on ? '@' + config.tiktok.username + ' (kết nối thẳng)' : 'qua TikFinity – hoặc nhập @tên trong bảng điều khiển'}
   YouTube Live    : ${config.youtube.on ? config.youtube.input : 'chưa bật'}
   Facebook Live   : ${config.facebook.on ? (config.facebook.page || 'Trang của token') : 'chưa bật'}
   Dừng app        : nhấn Ctrl+C trong cửa sổ này
`);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) exec(`open "${BASE}/panel"`);
  tiktokApply(); youtubeApply(); facebookApply();
});
const stop = () => { console.log('\n👋 Đóng quán. Hẹn gặp lại!'); tiktok.stop(); youtube.stop(); facebook.stop(); vnStop(); server.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
