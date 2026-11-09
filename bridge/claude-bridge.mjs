// Cầu nối Claude cho game "Quán nhậu vỉa hè Cậu Cả".
// Giữ Claude API key trên máy (biến môi trường, Keychain qua start.command, hoặc `ant auth login`);
// trang game chỉ gọi đường /mc trên máy – key không bao giờ nằm trong trình duyệt.
//
// Dùng riêng:  npm install && ANTHROPIC_API_KEY=sk-ant-... npm run bridge
// App Mac (app/server.mjs) dùng lại createClaudeHandler() trên cùng cổng với game.
// Tuỳ chọn: PORT=8787  MAX_CALLS_PER_HOUR=300  ALLOW_ORIGINS="https://ten-ban.github.io"
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);

export function claudeReady() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}
// Chỉ trang game của bạn được gọi: file mở trực tiếp, localhost, và các địa chỉ trong ALLOW_ORIGINS
export function originAllowed(o, extra = []) {
  if (!o || o === 'null') return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  return extra.includes(o);
}
// Chỉ chuyển tiếp các trường game cần
function sanitize(b) {
  const bad = m => Object.assign(new Error(m), { status: 400 });
  if (!b || typeof b !== 'object') throw bad('Thiếu nội dung yêu cầu');
  if (!MODELS.has(b.model)) throw bad('Model không được phép: ' + b.model);
  if (!Array.isArray(b.messages) || !b.messages.length) throw bad('Thiếu messages');
  const req = {
    model: b.model, max_tokens: Math.min(4096, Math.max(256, Number(b.max_tokens) || 2048)),
    system: b.system, tools: b.tools, tool_choice: b.tool_choice || { type: 'auto' },
    output_config: b.output_config, messages: b.messages,
  };
  if (b.model !== 'claude-haiku-5-5') { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
  return req;
}
function sendJson(res, status, obj, origin) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type', 'vary': 'origin',
  });
  res.end(status === 204 ? '' : JSON.stringify(obj));
}
// Trình xử lý POST /mc: (req, res) => Promise
export function createClaudeHandler({ maxPerHour = 300, extraOrigins = [] } = {}) {
  let client = null; const calls = [];
  const handler = async (req, res) => {
    const origin = req.headers.origin;
    if (!originAllowed(origin, extraOrigins)) return sendJson(res, 403, { error: { status: 403, message: 'Origin không được phép: ' + origin } }, 'null');
    const allow = origin || '*';
    if (req.method === 'OPTIONS') return sendJson(res, 204, {}, allow);
    if (req.method !== 'POST') return sendJson(res, 405, { error: { status: 405, message: 'Chỉ nhận POST' } }, allow);
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 200_000) return sendJson(res, 413, { error: { status: 413, message: 'Yêu cầu quá lớn' } }, allow); }
    const t = Date.now(); while (calls.length && t - calls[0] > 3_600_000) calls.shift();
    if (calls.length >= maxPerHour) return sendJson(res, 429, { error: { status: 429, message: 'Cầu nối đã chạm giới hạn lượt gọi trong giờ' } }, allow);
    try {
      const params = sanitize(JSON.parse(raw || '{}'));
      if (!claudeReady()) throw Object.assign(new Error('Chưa có Claude API key – chạy lại start.command để nhập key'), { status: 401 });
      if (!client) client = new Anthropic({ maxRetries: 1, timeout: 45000 });   // đọc ANTHROPIC_API_KEY hoặc hồ sơ `ant auth login`
      calls.push(t);
      const msg = await client.beta.messages.create(params);
      sendJson(res, 200, { model: msg.model, stop_reason: msg.stop_reason, content: msg.content, usage: msg.usage }, allow);
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? (e.status || 502) : (e.status || 500);
      console.error(`[claude] lỗi ${status}:`, e.message);
      sendJson(res, status, { error: { status, message: String(e.message || e).slice(0, 300) } }, allow);
    }
  };
  handler.callsLastHour = () => { const t = Date.now(); return calls.filter(x => t - x < 3_600_000).length; };
  return handler;
}

// Chạy riêng: node bridge/claude-bridge.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT || 8787);
  const handler = createClaudeHandler({
    maxPerHour: Number(process.env.MAX_CALLS_PER_HOUR || 300),
    extraOrigins: String(process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  });
  http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, claudeReady: claudeReady(), callsLastHour: handler.callsLastHour() });
    if (req.url === '/mc') return handler(req, res);
    sendJson(res, 404, { error: { status: 404, message: 'Không có' } });
  }).listen(PORT, '127.0.0.1', () => console.log(`Cầu nối Claude đang chạy: http://127.0.0.1:${PORT}/mc`));
}
