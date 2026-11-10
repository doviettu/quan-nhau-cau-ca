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
import { ObsClient } from './obs.mjs';
import { Relay } from './relay.mjs';
import { readObsPassword } from './obs-setup.mjs';
import { createRequire } from 'node:module';
const { badFilter } = createRequire(import.meta.url)('./locfilter.cjs');   // lọc từ tục (dùng chung với game)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DEFAULTS = {
  port: 8686,
  tikfinityUrl: 'ws://localhost:21213/',
  tiktok: { username: '', on: false },   // kết nối thẳng TikTok LIVE bằng @tên (không cần TikFinity)
  youtube: { on: false, input: '', key: '', minPoll: 8 },   // chat YouTube Live qua YouTube Data API (key riêng hoặc dùng chung key karaoke)
  facebook: { on: false, page: '' },   // comment Facebook Live qua Graph API; Page token lưu trong Keychain
  // OBS phát một luồng về bộ chuyển tiếp trên máy → YouTube, Facebook, TikTok (khóa luồng + mật khẩu OBS nằm trong Keychain)
  obsLive: { url: 'ws://127.0.0.1:4455', res: '720x1280', bitrate: 3500, relayPort: 19350, relayKey: '', auto: false,
    yt: { on: false, server: 'rtmps://a.rtmps.youtube.com/live2' }, fb: { on: false, server: 'rtmps://live-api-s.facebook.com:443/rtmp/' }, tt: { on: false, server: '' } },
  notify: { on: true, topic: '', server: 'https://ntfy.sh', idleMin: 10 },   // báo về điện thoại qua app ntfy
  game: { aiOn: true, aiModel: 'claude-haiku-5-5', aiEvery: 20, aiMax: 180, ytKey: '', kMin: 50, kPrio: 180, kMax: 5, botsOn: true, botMin: 20, mgAuto: true, mgEvery: 3, autoOn: true, autoLuckyMin: 8, bgmYt: false, bgmSource: 'youtube', bgmFolder: '', bgmScanVer: 0, bgmQuery: '', bgmLinks: '', bgmShuffle: true, bgmVol: 35, camTourEvery: 8, stageCam: true, stageFx: true, circusAuto: true, circusEvery: 6, mcVoice: true, mcGap: 40, jokeOn: true, jokeEvery: 4, voiceEngine: 'auto', vieneuVoice: 'Trúc Ly', macVoice: '', voiceRate: 1 },
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
if (!config.obsLive.relayKey) { config.obsLive.relayKey = 'cauca-' + crypto.randomBytes(4).toString('hex'); saveConfig(); }
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
let viVoice = null, voiceChecked = false, saying = false, macVoices = []; const sayQ = [];
function checkVoice() {
  if (process.platform !== 'darwin') { voiceChecked = true; return; }
  execFile('say', ['-v', '?'], (e, out) => {
    voiceChecked = true; if (e) return;
    // mọi giọng tiếng Việt của macOS (Linh, bản nâng cao nếu đã tải…)
    macVoices = String(out).split('\n').filter(l => /\bvi[_-]VN\b/.test(l)).map(l => l.split(/\s{2,}/)[0].trim()).filter(Boolean);
    viVoice = macVoices[0] || null;
  });
}
const macVoiceName = () => (macVoices.includes(config.game.macVoice) ? config.game.macVoice : viVoice);
const voiceRate = () => Math.min(1.5, Math.max(0.7, Number(config.game.voiceRate) || 1));
// 25 giọng có sẵn của VieNeu v3 Turbo (tên · giới tính · miền · phong cách) – hiện cả khi VieNeu chưa chạy
const VN_PRESETS = [['Trúc Ly', 'nữ', 'Bắc', 'tự nhiên', 2], ['Mai Anh', 'nữ', 'Bắc', 'tin tức', 4], ['Ngọc Huyền', 'nữ', 'Bắc', 'tự nhiên', 8], ['Đoan Trang', 'nữ', 'Bắc', 'tự nhiên'], ['Ngọc Linh', 'nữ', 'Bắc', 'kể chuyện'], ['Quỳnh Anh', 'nữ', 'Bắc', 'đọc truyện'],
  ['Ngọc Trân', 'nữ', 'Trung', 'tự nhiên', 10], ['Thùy Dung', 'nữ', 'Nam', 'tin tức', 6], ['Thục Đoan', 'nữ', 'Nam', 'kể chuyện'], ['Mỹ Duyên', 'nữ', 'Nam', 'đọc truyện'], ['Kim Thanh', 'nữ', 'Nam', 'đọc truyện'],
  ['Adam bựa', 'nam', 'Bắc', 'tự nhiên', 1], ['Hải Đăng', 'nam', 'Bắc', 'tự nhiên', 5], ['Thiện Minh', 'nam', 'Bắc', 'kể chuyện', 3], ['Thiền Tâm Đức', 'nam', 'Bắc', 'kể chuyện', 7], ['Minh Đức', 'nam', 'Bắc', 'tin tức'], ['Phạm Tuyên', 'nam', 'Bắc', 'tự nhiên'],
  ['Xuân Vĩnh', 'nam', 'Bắc', 'tự nhiên'], ['Thanh Bình', 'nam', 'Bắc', 'kể chuyện'], ['Quốc Tuấn', 'nam', 'Bắc', 'tự nhiên'], ['Quang Sơn', 'nam', 'Trung', 'tự nhiên', 9], ['Thái Sơn', 'nam', 'Nam', 'kể chuyện'], ['Minh Triết', 'nam', 'Nam', 'tin tức'],
  ['Đức Trí', 'nam', 'Nam', 'đọc truyện'], ['Adam', 'nam', 'Nam', 'tự nhiên']];
function voiceList() {
  const parse = d => { const p = String(d || '').split('·').map(x => x.trim()); return { gender: /nữ/i.test(p[0]) ? 'nữ' : /nam/i.test(p[0]) ? 'nam' : '', region: p[1] || '', style: String(p[2] || '').replace(/^(Phong cách|Giọng đọc)\s*/i, '') }; };
  const live = vn.state === 'ready' && vn.voices.length;
  const vnl = live ? vn.voices.map(v => ({ id: v.id, ...parse(v.desc), ...(v.gender ? { gender: v.gender === 'female' ? 'nữ' : 'nam' } : {}), featured: v.featured || null }))
    : VN_PRESETS.map(([id, gender, region, style, featured]) => ({ id, gender, region, style, featured: featured || null }));
  return {
    vieneu: { installed: vnInstalled(), state: vn.state, err: vn.err, voices: vnl.map(v => ({ engine: 'vieneu', ...v })) },
    mac: { available: process.platform === 'darwin' && macVoices.length > 0, voices: macVoices.map(id => ({ engine: 'mac', id, gender: /^linh/i.test(id) ? 'nữ' : '', region: '', style: 'giọng máy macOS' })) },
    current: currentVoice(), rate: voiceRate(), engineSetting: config.game.voiceEngine || 'auto',
  };
}
function currentVoice() {
  const eng = config.game.voiceEngine === 'mac' ? 'mac' : vn.state === 'ready' ? 'vieneu' : config.game.voiceEngine === 'vieneu' ? 'vieneu' : macVoiceName() ? 'mac' : 'vieneu';
  return { engine: eng, id: eng === 'mac' ? macVoiceName() : config.game.vieneuVoice, ready: eng === 'mac' ? !!macVoiceName() : vn.state === 'ready' };
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
async function vnLoadVoices() { try { const j = await (await fetch(vn.url + '/v1/voices', { signal: AbortSignal.timeout(5000) })).json(); vn.voices = (j.data || []).map(v => ({ id: v.id, desc: v.description || '', gender: v.gender || '', featured: v.featured || null })); } catch { } }
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
async function vnSynth(text, want) {
  want = want || config.game.vieneuVoice;
  const voice = vn.voices.some(v => v.id === want) ? want : undefined;
  const r = await fetch(vn.url + '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: 'vieneu-v3-turbo', input: text, voice, response_format: 'pcm', sample_rate: 24000 }) });
  if (!r.ok) throw new Error('VieNeu HTTP ' + r.status);
  return wavFromPcm(Buffer.from(await r.arrayBuffer()), 24000);
}
let wavN = 0;
function playWav(buf, rate = 1) {
  return new Promise(res => {
    const f = path.join(os.tmpdir(), `caucalive-${process.pid}-${wavN++ % 4}.wav`); fs.writeFileSync(f, buf);
    const player = process.platform === 'darwin' ? 'afplay' : process.env.CAUCA_PLAYER;
    if (!player) return setTimeout(res, Math.round((buf.length - 44) / 48));   // không có trình phát (máy thử): giả thời lượng
    const args = process.platform === 'darwin' && Math.abs(rate - 1) > 0.02 ? ['-r', rate.toFixed(2), '-q', '1', f] : [f];   // tốc độ đọc: afplay phát nhanh/chậm hơn
    execFile(player, args, { timeout: 60000 }, () => res());
  });
}
const EMO = /\[(cười|thở dài|hắng giọng)\]/g;   // ký hiệu cảm xúc của VieNeu – giọng Mac thì bỏ đi
function sayMac(t, voice) { const s = t.replace(EMO, ' ').trim(), v = voice || macVoiceName(); return s && v ? new Promise(res => execFile('say', ['-v', v, '-r', String(Math.round(190 * voiceRate())), s], { timeout: 30000 }, () => res())) : Promise.resolve(); }
let nextWav = null;   // tạo sẵn câu kế tiếp trong lúc đang phát câu trước
// mỗi câu trong hàng đợi: { t: chữ, engine, voice } – engine/voice rỗng = giọng đang chọn
async function sayNext() {
  if (saying || !sayQ.length) return;
  saying = true; const it = sayQ.shift();
  const eng = it.engine || currentVoice().engine, macV = it.engine === 'mac' ? it.voice : undefined;
  try {
    if (eng === 'vieneu' && vn.state === 'ready') {
      const buf = nextWav && nextWav.it === it ? await nextWav.p : await vnSynth(it.t, it.voice); nextWav = null;
      const n = sayQ[0]; if (n && (n.engine || currentVoice().engine) === 'vieneu') nextWav = { it: n, p: vnSynth(n.t, n.voice).catch(() => null) };
      if (buf) await playWav(buf, voiceRate()); else await sayMac(it.t);
    } else await sayMac(it.t, macV);
  } catch (e) { vn.err = String(e.message || e); await sayMac(it.t); }
  saying = false; sayNext();
}
function speak(text, opt = {}) {
  const useVn = opt.engine ? opt.engine === 'vieneu' && vn.state === 'ready' : vn.state === 'ready' && config.game.voiceEngine !== 'mac';
  if (opt.engine === 'vieneu' && vn.state !== 'ready') return { ok: false, error: !vnInstalled() ? 'Chưa cài VieNeu – nhấp đúp cai-giong-vieneu.command (một lần) rồi mở lại app' : vn.state === 'starting' ? 'VieNeu đang khởi động, thử lại sau ít phút' : 'VieNeu chưa chạy' + (vn.err ? ': ' + vn.err : '') };
  if (opt.engine === 'mac' && !macVoices.includes(opt.voice)) return { ok: false, error: 'Mac không có giọng này' };
  if (!useVn && process.platform !== 'darwin') return { ok: false, error: vn.state === 'starting' ? 'Giọng VieNeu đang khởi động' : 'Chỉ đọc bằng giọng máy trên Mac' };
  if (!useVn && !viVoice) return { ok: false, error: vn.state === 'starting' ? 'Giọng VieNeu đang khởi động' : voiceChecked ? 'Chưa có giọng: chạy cai-giong-vieneu.command (khuyên dùng) hoặc cài giọng Linh của Mac' : 'Đang kiểm tra giọng đọc' };
  const t = String(text || '').replace(/\[(cười|thở dài|hắng giọng)\]/g, '\u0001$1\u0002').replace(/[@#*_`<>\[\]{}|\\]/g, ' ').replace(/\u0001/g, '[').replace(/\u0002/g, ']').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!t) return { ok: false, error: 'Không có nội dung' };
  if (badFilter(t).bad) { console.log('🚫 Bỏ câu có từ không phù hợp, không đọc: ' + badFilter(t).text); return { ok: false, error: 'Câu có từ không phù hợp – không đọc' }; }
  if (opt.preview) sayQ.length = 0;   // nghe thử: bỏ các câu đang chờ để nghe ngay
  if (sayQ.length >= 4) sayQ.shift();   // đừng dồn quá: bỏ câu cũ nhất (đủ chỗ cho một câu chuyện nhiều câu)
  sayQ.push({ t, engine: opt.engine || '', voice: opt.voice || '' }); sayNext();
  return { ok: true, voice: useVn ? 'VieNeu · ' + (opt.voice || config.game.vieneuVoice || 'mặc định') : (opt.voice || macVoiceName()) };
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
// ---- 📁 nhạc nền từ thư mục trên máy: quét file nhạc/video, phát cho game qua /media/bgm/<số> (chỉ file trong danh sách đã quét) ----
const MEDIA_TYPES = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
let bgmFiles = [];
function bgmScan() {
  const dir = String(config.game.bgmFolder || ''); const out = [];
  const walk = (d, depth) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walk(fp, depth + 1);
      else if (e.isFile() && MEDIA_TYPES[path.extname(e.name).toLowerCase()] && out.length < 2000) out.push({ name: path.relative(dir, fp), path: fp });
    }
  };
  if (dir) walk(dir, 0);
  out.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
  bgmFiles = out; return out;
}
function bgmSetFolder(folder) {
  folder = path.resolve(String(folder || '').trim().replace(/^~(?=\/|$)/, os.homedir()));
  let st; try { st = fs.statSync(folder); } catch { throw new Error('Không thấy thư mục: ' + folder); }
  if (!st.isDirectory()) throw new Error('Đây không phải thư mục: ' + folder);
  config.game.bgmFolder = folder; config.game.bgmSource = 'folder'; config.game.bgmScanVer = (Number(config.game.bgmScanVer) || 0) + 1;
  const files = bgmScan(); saveConfig(); broadcast({ type: 'config', config: publicConfig() });
  return { ok: true, folder, count: files.length, sample: files.slice(0, 8).map(f => f.name) };
}
function sendMedia(req, res, f) {
  let st; try { st = fs.statSync(f.path); } catch { return json(res, 404, { error: 'File đã bị xoá hoặc đổi tên – bấm Quét lại' }); }
  const type = MEDIA_TYPES[path.extname(f.path).toLowerCase()] || 'application/octet-stream', size = st.size;
  const m = String(req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
  if (m) {
    let a = m[1] ? Number(m[1]) : size - Number(m[2]), b = m[1] && m[2] ? Number(m[2]) : size - 1;
    if (!(a >= 0 && a < size)) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    b = Math.min(b, size - 1);
    res.writeHead(206, { 'content-type': type, 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
    return fs.createReadStream(f.path, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
  fs.createReadStream(f.path).pipe(res);
}
bgmScan();
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
// ---- OBS + bộ chuyển tiếp: một luồng từ OBS → YouTube, Facebook, TikTok ----
const obs = new ObsClient();
const relay = new Relay();
const obsState = { lastSync: null, streaming: false, timecode: '', at: 0 };
const PF_NAMES = { yt: 'YouTube', fb: 'Facebook', tt: 'TikTok' };
function relayTargets() {
  const o = config.obsLive, out = [];
  for (const k of ['yt', 'fb', 'tt']) {
    const t = o[k], key = secretGet('stream-' + k);
    if (t && t.on && key && /^rtmps?:\/\//.test(t.server || '')) out.push({ name: PF_NAMES[k], url: String(t.server).replace(/\/+$/, '') + '/' + key });
  }
  return out;
}
function relayApply() { relay.start(relayTargets(), { port: config.obsLive.relayPort, key: config.obsLive.relayKey }); }
relay.on('streaming', () => console.log('🎬 OBS đang phát qua bộ chuyển tiếp → ' + relay.targets.map(t => t.name).join(', ')));
relay.on('targetFailed', (name, line) => { console.log(`⚠️ Không phát được lên ${name}: ${line}`); notify(`⚠️ Mất luồng ${name}`, `Bộ chuyển tiếp không phát được lên ${name}. Kiểm tra khóa luồng và bấm Phát trực tiếp trên ${name}, rồi dừng/phát lại OBS.`, 4); });
// mật khẩu OBS: lấy trong Keychain (nếu bạn tự dán), không có thì đọc thẳng từ file cấu hình WebSocket của OBS trên máy
const obsPassword = () => secretGet('obs') || readObsPassword();
async function obsConnect() { await obs.connect(config.obsLive.url, obsPassword()); }
async function obsSync() {
  await obsConnect();
  const [w, h] = String(config.obsLive.res || '720x1280').split('x').map(Number);
  relayApply();
  const r = await obs.sync({ width: w || 720, height: h || 1280, bitrate: Number(config.obsLive.bitrate) || 3500, server: relay.ingest, key: config.obsLive.relayKey });
  if (!relay.targets.length) r.warnings.push(relay.error);
  obsState.lastSync = { ...r, at: Date.now() };
  if (!config.obsLive.auto) { config.obsLive.auto = true; saveConfig(); }
  return r;
}
setInterval(async () => {
  if (!obs.connected) return;
  try { const s = await obs.streamStatus(); obsState.streaming = s.active; obsState.timecode = s.timecode; obsState.at = Date.now(); } catch { }
}, 4000);

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

// ---- kết nối thông minh: dán link/@tên bất kỳ → tự nhận ra nền tảng ----
function detectPlatform(text) {
  const t = String(text || '').trim(); if (!t) return null;
  if (/tiktok\.com/i.test(t)) return { platform: 'tiktok', value: normalizeUser(t) };
  if (/youtu\.?be|youtube\.com/i.test(t) || /^UC[\w-]{22}$/.test(t)) return { platform: 'youtube', value: t };
  if (/facebook\.com|fb\.com|fb\.watch/i.test(t)) return { platform: 'facebook', value: t };
  if (/^@?[\w.\-]{2,30}$/.test(t)) return { platform: null, value: t.replace(/^@/, ''), ambiguous: ['tiktok', 'youtube', 'facebook'] };
  return null;
}
async function smartConnect(text, as) {
  let d = detectPlatform(text);
  if (!d) return { ok: false, error: 'Không nhận ra – dán link kênh TikTok, YouTube, Trang Facebook hoặc @tên' };
  if (as && ['tiktok', 'youtube', 'facebook'].includes(as)) d = { ...d, platform: as };
  if (!d.platform) return { ok: false, ask: d.ambiguous, value: d.value };
  if (d.platform === 'tiktok') {
    const u = normalizeUser(d.value); if (!validUser(u)) return { ok: false, error: 'Tên TikTok không hợp lệ' };
    config.tiktok = { username: u, on: true }; saveConfig(); tiktokApply();
  } else if (d.platform === 'youtube') {
    const v = /^[\w.\-]{3,30}$/.test(d.value) && !/youtu/i.test(d.value) && !/^UC/.test(d.value) ? '@' + d.value : d.value;
    if (!parseYouTubeInput(v)) return { ok: false, error: 'Link YouTube không hợp lệ' };
    config.youtube = { ...config.youtube, input: v, on: true }; saveConfig(); youtubeApply();
    if (!ytKey()) { broadcast({ type: 'config', config: publicConfig() }); return { ok: true, platform: 'youtube', need: 'ytKey' }; }
  } else {
    const page = parsePage(d.value); if (page === null) return { ok: false, error: 'Tên Trang Facebook không hợp lệ' };
    config.facebook = { ...config.facebook, page: page === 'me' ? '' : page, on: true }; saveConfig();
    if (!secretGet('facebook')) { broadcast({ type: 'config', config: publicConfig() }); return { ok: true, platform: 'facebook', need: 'fbToken' }; }
    facebookApply();
  }
  broadcast({ type: 'config', config: publicConfig() });
  return { ok: true, platform: d.platform };
}
// ---- một nút "Bắt đầu buổi live": cửa sổ game, các nguồn comment, OBS ----
async function sessionStart() {
  const steps = [];
  if (!controlClients.size) { const r = openGameWindow(); steps.push({ name: 'Cửa sổ game', ok: r.ok, msg: r.ok ? 'đang mở…' : r.error }); await sleep(r.ok ? 4000 : 0); }
  else steps.push({ name: 'Cửa sổ game', ok: true, msg: 'đang chạy' });
  const pf = [['TikTok', config.tiktok.on, () => tiktokApply(), tiktok], ['YouTube', config.youtube.on, () => youtubeApply(), youtube], ['Facebook', config.facebook.on, () => facebookApply(), facebook]];
  for (const [name, on, apply, src] of pf) {
    if (!on) continue;
    if (src.state !== 'live' && src.state !== 'connecting') apply();
    steps.push({ name: name + ' (comment)', ok: src.state !== 'error', msg: src.state === 'live' ? 'đang nhận' : 'đang chờ buổi live – app tự nối khi bạn bắt đầu live' });
  }
  if (!pf.some(x => x[1])) steps.push({ name: 'Comment', ok: false, msg: 'chưa thêm nền tảng nào – dán link kênh vào ô Kết nối nhanh' });
  if (config.obsLive.auto || obsPassword()) {
    try {
      const r = await obsSync();
      if (!relay.targets.length) steps.push({ name: 'OBS', ok: false, msg: 'chưa có khóa luồng nào – nhập trong thẻ OBS' });
      else if (obsState.streaming) steps.push({ name: 'OBS', ok: true, msg: 'đang phát rồi' });
      else { await obs.startStream(); steps.push({ name: 'OBS', ok: true, msg: 'bắt đầu phát → ' + relay.targets.map(t => t.name).join(', ') }); }
      for (const w of r.warnings.filter(Boolean)) steps.push({ name: 'OBS', ok: false, msg: w });
    } catch (e) { steps.push({ name: 'OBS', ok: false, msg: String(e.message || e) }); }
  } else steps.push({ name: 'OBS', ok: null, msg: 'không dùng (TikTok phát bằng LIVE Studio)' });
  return { ok: steps.every(s => s.ok !== false), steps };
}
// ---- 🩺 kiểm tra nhanh mọi thứ, kèm cách sửa ----
async function healthCheck() {
  const out = [], add = (name, ok, msg, fix = '') => out.push({ name, ok, msg, fix });
  const lb = o => o.error || ({ connecting: 'đang kết nối', offline: 'chưa live', off: 'đang tắt', live: 'đang live' }[o.state] || o.state);
  add('Cửa sổ game', controlClients.size > 0, controlClients.size ? 'đang chạy' : 'chưa mở', 'Bấm 🪟 Mở cửa sổ game');
  add('Claude MC', claudeReady(), claudeReady() ? 'có key' : 'chưa có key – Cậu Cả nói theo kịch bản', 'Chạy ./start.command --reset-key để nhập key');
  const cv = currentVoice();
  add('Giọng MC', cv.ready, cv.ready ? `${cv.engine === 'mac' ? 'giọng Mac' : 'VieNeu'} · ${cv.id}` : (vn.state === 'starting' ? 'VieNeu đang khởi động' : 'chưa có giọng'), vnInstalled() ? '' : 'Nhấp đúp cai-giong-vieneu.command để có giọng tự nhiên');
  if (config.tiktok.on) add('TikTok', tiktok.state === 'live', tiktok.state === 'live' ? '@' + tiktok.username + ' đang live' : lb(tiktok), 'Bắt đầu live trên TikTok – app tự nối');
  if (config.youtube.on) {
    let msg = youtube.state === 'live' ? 'đang nhận chat' : lb(youtube), ok = youtube.state === 'live';
    if (!ytKey()) { ok = false; msg = 'chưa có YouTube API key'; }
    add('YouTube', ok, msg, ytKey() ? 'Bắt đầu live trên YouTube; nếu app không tự thấy, dán link buổi live' : 'Dán YouTube Data API key (Nâng cao → YouTube)');
  }
  if (config.facebook.on) {
    let ok = facebook.state === 'live', msg = ok ? 'đang nhận comment' : lb(facebook);
    if (!secretGet('facebook')) { ok = false; msg = 'chưa có Page token'; }
    else if (!ok) { try { const r = await fetch(`${process.env.FB_GRAPH_BASE || 'https://graph.facebook.com'}/me?fields=name&access_token=${encodeURIComponent(secretGet('facebook'))}`, { signal: AbortSignal.timeout(8000) }); const j = await r.json(); if (j.error) { msg = 'token lỗi: ' + j.error.message; } else msg = `token hợp lệ (${j.name}) · ${msg}`; } catch { } }
    add('Facebook', ok, msg, 'Dán Page token mới (Nâng cao → Facebook) hoặc bắt đầu live trên Trang');
  }
  if (config.obsLive.auto || obsPassword()) {
    try { await obsConnect(); add('OBS', true, obsState.streaming ? 'đang phát' : 'đã kết nối', ''); } catch (e) { add('OBS', false, e.message, 'Mở OBS → Tools → WebSocket Server Settings → Enable, nhập đúng mật khẩu'); }
    const ff = await new Promise(r => execFile(process.env.FFMPEG || 'ffmpeg', ['-version'], { timeout: 5000 }, e => r(!e)));
    add('ffmpeg (bộ chuyển tiếp)', ff, ff ? 'có sẵn' : 'chưa cài', 'Mở Terminal chạy: brew install ffmpeg');
    add('Khóa luồng', relayTargets().length > 0, relayTargets().map(t => t.name).join(', ') || 'chưa có', 'Nhập khóa luồng trong thẻ OBS');
  }
  add('Báo về điện thoại', !!config.notify.on, config.notify.on ? 'bật' : 'tắt', 'Bật trong thẻ 🔔');
  return { ok: out.every(x => x.ok), items: out };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE); const p = url.pathname;
  try {
    if (p === '/mc') {
      if (!live.ok && req.method === 'POST') return json(res, 503, { error: { status: 503, message: 'Live đang dừng – app tạm ngưng gọi Claude' } });
      return claude(req, res);
    }
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && p.startsWith('/media/bgm/')) { const f = bgmFiles[Number(p.slice(11))]; return f ? sendMedia(req, res, f) : json(res, 404, { error: 'Không có bài này' }); }
    if (req.method === 'GET' && p === '/api/bgm/files') return json(res, 200, { folder: config.game.bgmFolder, ver: config.game.bgmScanVer, files: bgmFiles.map((f, i) => ({ i, name: f.name })) });
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
        obs: { connected: obs.connected, error: obs.err, streaming: obsState.streaming, timecode: obsState.timecode, lastSync: obsState.lastSync, relay: relay.status(),
          cfg: { url: config.obsLive.url, res: config.obsLive.res, bitrate: config.obsLive.bitrate, hasPassword: !!obsPassword(), autoPassword: !secretGet('obs') && !!readObsPassword(),
            ...Object.fromEntries(['yt', 'fb', 'tt'].map(k => [k, { on: !!config.obsLive[k].on, server: config.obsLive[k].server, hasKey: !!secretGet('stream-' + k) }])) } },
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
      if (isObj(game) && typeof game.bgmLinks === 'string') game.bgmLinks = game.bgmLinks.slice(0, 8000);
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
    if (p === '/api/obs/save') {
      const o = config.obsLive;
      if (typeof b.url === 'string' && /^wss?:\/\/[\w.\-]+(:\d+)?\/?$/.test(b.url.trim())) o.url = b.url.trim();
      if (typeof b.password === 'string' && b.password) secretSet('obs', b.password);
      if (['720x1280', '1080x1920'].includes(b.res)) o.res = b.res;
      if (Number(b.bitrate) >= 1000) o.bitrate = Math.min(9000, Math.round(Number(b.bitrate)));
      for (const k of ['yt', 'fb', 'tt']) {
        const t = isObj(b.targets) && b.targets[k]; if (!isObj(t)) continue;
        if (typeof t.on === 'boolean') o[k].on = t.on;
        if (typeof t.server === 'string' && t.server.trim()) { if (!/^rtmps?:\/\/\S+$/.test(t.server.trim())) throw new Error(`Địa chỉ máy chủ ${PF_NAMES[k]} phải bắt đầu bằng rtmp:// hoặc rtmps://`); o[k].server = t.server.trim(); }
        if (typeof t.key === 'string' && t.key.trim()) { if (/[\s|\[\]]/.test(t.key.trim())) throw new Error(`Khóa luồng ${PF_NAMES[k]} không đúng dạng`); secretSet('stream-' + k, t.key.trim()); }
        if (t.forget) secretSet('stream-' + k, '');
      }
      saveConfig();
      if (relay.want && relay.state !== 'streaming') relayApply();
      return json(res, 200, { ok: true, targets: relayTargets().map(t => t.name) });
    }
    if (p === '/api/obs/sync') { try { return json(res, 200, await obsSync()); } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); } }
    if (p === '/api/obs/start') {
      try {
        await obsConnect();
        if (!relay.want || relay.state === 'off' || relay.state === 'error') { const r = await obsSync(); if (!relay.targets.length) return json(res, 200, { ok: false, error: relay.error, sync: r }); }
        if (relay.state === 'streaming') return json(res, 200, { ok: true, already: true });
        await obs.startStream(); return json(res, 200, { ok: true, targets: relay.targets.map(t => t.name) });
      } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
    }
    if (p === '/api/obs/stop') { try { await obsConnect(); await obs.stopStream(); return json(res, 200, { ok: true }); } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); } }
    if (p === '/api/notify/test') return json(res, 200, await notify('🍻 Cậu Cả Live', 'Thử thông báo: điện thoại đã nhận được báo từ app.', 3));
    if (p === '/api/speak') return json(res, 200, speak(b.text));
    if (p === '/api/voices') return json(res, 200, voiceList());
    if (p === '/api/voice/preview') {
      const engine = b.engine === 'mac' ? 'mac' : 'vieneu', voice = String(b.id || '').slice(0, 64);
      const text = String(b.text || '').trim().slice(0, 160) || 'Chào cả nhà! Mời cả nhà vào quán vỉa hè Cậu Cả, comment một câu là có ghế ngồi liền nha!';
      return json(res, 200, speak(text, { engine, voice, preview: true }));
    }
    if (p === '/api/voice/set') {
      const g = config.game, prevEng = g.voiceEngine;
      if (b.engine === 'mac') { if (!macVoices.includes(b.id)) throw new Error('Mac không có giọng này'); g.voiceEngine = 'mac'; g.macVoice = b.id; }
      else if (b.engine === 'vieneu') { if (!VN_PRESETS.some(v => v[0] === b.id) && !vn.voices.some(v => v.id === b.id)) throw new Error('Không có giọng VieNeu này'); g.voiceEngine = 'vieneu'; g.vieneuVoice = b.id; }
      if (Number(b.rate) >= 0.7 && Number(b.rate) <= 1.5) g.voiceRate = Math.round(Number(b.rate) * 100) / 100;
      saveConfig();
      if (g.voiceEngine !== prevEng) { if (g.voiceEngine === 'mac') vnStop(); else vnStart(); }
      broadcast({ type: 'config', config: publicConfig() });
      return json(res, 200, { ok: true, current: currentVoice(), rate: voiceRate() });
    }
    if (p === '/api/bgm/folder') { try { return json(res, 200, bgmSetFolder(b.folder)); } catch (e) { return json(res, 200, { ok: false, error: e.message }); } }
    if (p === '/api/bgm/rescan') { config.game.bgmScanVer = (Number(config.game.bgmScanVer) || 0) + 1; const files = bgmScan(); saveConfig(); broadcast({ type: 'config', config: publicConfig() }); return json(res, 200, { ok: true, folder: config.game.bgmFolder, count: files.length, sample: files.slice(0, 8).map(f => f.name) }); }
    if (p === '/api/bgm/pick') {
      // mở hộp chọn thư mục của macOS (chờ bạn chọn, tối đa 5 phút)
      if (process.platform !== 'darwin') return json(res, 200, { ok: false, error: 'Chỉ chọn bằng hộp thoại được trên Mac – hãy gõ đường dẫn thư mục' });
      const r = await new Promise(resolve => execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "Chọn thư mục nhạc nền cho quán Cậu Cả")'], { timeout: 300000 }, (e, out) => resolve(e ? null : String(out).trim())));
      if (!r) return json(res, 200, { ok: false, error: 'Chưa chọn thư mục' });
      try { return json(res, 200, bgmSetFolder(r)); } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
    }
    if (p === '/api/connect/smart') return json(res, 200, await smartConnect(String(b.text || '').trim(), b.as));
    if (p === '/api/session/start') return json(res, 200, await sessionStart());
    if (p === '/api/session/stop') { const steps = []; if (obs.connected) { try { await obs.stopStream(); steps.push({ name: 'OBS', ok: true, msg: 'đã dừng phát' }); } catch (e) { steps.push({ name: 'OBS', ok: false, msg: e.message }); } } return json(res, 200, { ok: true, steps }); }
    if (p === '/api/check') return json(res, 200, await healthCheck());
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
  if (config.obsLive.auto) { relayApply(); obsConnect().then(() => console.log('🎬 Đã kết nối OBS')).catch(() => { }); }
});
const stop = () => { console.log('\n👋 Đóng quán. Hẹn gặp lại!'); tiktok.stop(); youtube.stop(); facebook.stop(); relay.stop(); obs.close(); vnStop(); server.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
