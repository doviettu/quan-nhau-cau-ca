// Cầu nối Claude cho game "Quán nhậu vỉa hè Cậu Cả".
// Giữ Claude API key trên máy của bạn (biến môi trường hoặc `ant auth login`),
// game trong trình duyệt chỉ gọi http://127.0.0.1:8787/mc – key không bao giờ nằm trong trang web.
//
// Chạy:  cd bridge && npm install && ANTHROPIC_API_KEY=sk-ant-... npm start
// Tuỳ chọn: PORT=8787  MAX_CALLS_PER_HOUR=300  ALLOW_ORIGINS="https://ten-ban.github.io,http://localhost:3000"
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT || 8787);
const MAX_PER_HOUR = Number(process.env.MAX_CALLS_PER_HOUR || 300);
const EXTRA_ORIGINS = String(process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const client = new Anthropic({ maxRetries: 1, timeout: 45000 });   // đọc ANTHROPIC_API_KEY hoặc hồ sơ `ant auth login`

// Chỉ trang game của bạn được gọi cầu nối: file mở trực tiếp, localhost, và các địa chỉ trong ALLOW_ORIGINS.
function originAllowed(o) {
  if (!o || o === 'null') return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  return EXTRA_ORIGINS.includes(o);
}
const calls = [];
function send(res, status, obj, origin) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'origin'
  });
  res.end(JSON.stringify(obj));
}
// Chỉ chuyển tiếp các trường game cần, giới hạn kích thước để tránh lạm dụng
function sanitize(b) {
  if (!b || typeof b !== 'object') throw Object.assign(new Error('Thiếu nội dung yêu cầu'), { status: 400 });
  if (!MODELS.has(b.model)) throw Object.assign(new Error('Model không được phép: ' + b.model), { status: 400 });
  if (!Array.isArray(b.messages) || !b.messages.length) throw Object.assign(new Error('Thiếu messages'), { status: 400 });
  const req = {
    model: b.model,
    max_tokens: Math.min(4096, Math.max(256, Number(b.max_tokens) || 2048)),
    system: b.system, tools: b.tools, tool_choice: b.tool_choice || { type: 'auto' },
    output_config: b.output_config, messages: b.messages,
  };
  if (b.model !== 'claude-haiku-5-5') { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
  return req;
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) return send(res, 403, { error: { status: 403, message: 'Origin không được phép: ' + origin } }, 'null');
  const allow = origin || '*';
  if (req.method === 'OPTIONS') return send(res, 204, {}, allow);
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, callsLastHour: calls.length }, allow);
  if (req.method !== 'POST' || req.url !== '/mc') return send(res, 404, { error: { status: 404, message: 'Không có' } }, allow);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 200_000) return send(res, 413, { error: { status: 413, message: 'Yêu cầu quá lớn' } }, allow); }
  const t = Date.now(); while (calls.length && t - calls[0] > 3_600_000) calls.shift();
  if (calls.length >= MAX_PER_HOUR) return send(res, 429, { error: { status: 429, message: 'Cầu nối đã chạm giới hạn lượt gọi trong giờ' } }, allow);
  try {
    const params = sanitize(JSON.parse(raw));
    calls.push(t);
    const msg = await client.beta.messages.create(params);
    send(res, 200, { model: msg.model, stop_reason: msg.stop_reason, content: msg.content, usage: msg.usage }, allow);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? (e.status || 502) : (e.status || 500);
    console.error(`[bridge] lỗi ${status}:`, e.message);
    send(res, status, { error: { status, message: String(e.message || e).slice(0, 300) } }, allow);
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Cầu nối Claude đang chạy: http://127.0.0.1:${PORT}/mc (tối đa ${MAX_PER_HOUR} lượt/giờ)`));
