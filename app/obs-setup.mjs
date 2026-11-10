// Bật sẵn WebSocket server của OBS (28 trở lên) bằng cách sửa file cấu hình của OBS trên máy,
// để app tự kết nối mà bạn không phải mở Tools → WebSocket Server Settings.
// Mật khẩu chỉ nằm trong file cấu hình của OBS trên máy bạn; app đọc file này khi kết nối, không in ra màn hình.
//   node app/obs-setup.mjs           xem trạng thái
//   node app/obs-setup.mjs --enable  bật WebSocket (cổng 4455, có mật khẩu) – nên tắt OBS trước
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const obsWsConfigPath = () => process.env.OBS_WS_CONFIG || path.join(os.homedir(), 'Library', 'Application Support', 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
export function readObsWs() { try { return JSON.parse(fs.readFileSync(obsWsConfigPath(), 'utf8')); } catch { return null; } }
export function readObsPassword() { const c = readObsWs(); return c && c.server_enabled !== false && c.auth_required !== false ? String(c.server_password || '') : ''; }
export function enableObsWs() {
  const f = obsWsConfigPath(), old = readObsWs() || {};
  const pw = old.server_password && String(old.server_password).length >= 6 ? old.server_password : crypto.randomBytes(12).toString('base64url');
  const cfg = { ...old, alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_port: Number(old.server_port) || 4455, server_password: pw };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cfg, null, 4), { mode: 0o600 });
  return { file: f, port: cfg.server_port, created: !Object.keys(old).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--enable')) { const r = enableObsWs(); console.log(`✅ Đã bật WebSocket của OBS (cổng ${r.port}, có mật khẩu) – ${r.file}`); }
  else { const c = readObsWs(); console.log(c ? `WebSocket OBS: ${c.server_enabled ? 'bật' : 'tắt'} · cổng ${c.server_port || 4455} · ${c.auth_required !== false && c.server_password ? 'có mật khẩu' : 'không mật khẩu'}` : 'Chưa có cấu hình WebSocket của OBS (mở OBS một lần hoặc chạy với --enable)'); }
}
