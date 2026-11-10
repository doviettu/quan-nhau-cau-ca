// Bộ chuyển tiếp trên máy: OBS phát MỘT luồng về đây, ffmpeg chép nguyên luồng (không mã hoá lại)
// rồi đẩy lên nhiều nơi cùng lúc (YouTube, Facebook, TikTok). Một nơi lỗi không làm dừng các nơi còn lại.
// Cần ffmpeg trên máy: brew install ffmpeg
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

export class Relay extends EventEmitter {
  constructor() {
    super();
    Object.assign(this, { state: 'off', error: '', port: 19350, key: 'cauca', proc: null, want: false, targets: [], failed: new Set(), streamTime: '', timer: null, startedAt: 0 });
  }
  get ingest() { return `rtmp://127.0.0.1:${this.port}/live`; }
  status() { return { state: this.state, error: this.error, time: this.streamTime, targets: this.targets.map((t, i) => ({ name: t.name, ok: !this.failed.has(i) })) }; }
  // targets: [{ name, url }] – url đầy đủ gồm cả khóa luồng
  start(targets, { port, key } = {}) {
    if (port) this.port = port; if (key) this.key = key;
    this.targets = (targets || []).filter(t => t && t.url);
    this.want = true; this._kill();
    if (!this.targets.length) { this.state = 'error'; this.error = 'Chưa bật nơi phát nào (nhập khóa luồng YouTube / Facebook / TikTok)'; return; }
    this._spawn();
  }
  stop() { this.want = false; clearTimeout(this.timer); this._kill(); this.state = 'off'; this.error = ''; this.streamTime = ''; }
  _kill() { const p = this.proc; this.proc = null; if (p) try { p.kill('SIGTERM'); } catch { } }
  _spawn() {
    if (!this.want) return;
    this.failed = new Set(); this.streamTime = '';
    const esc = u => u.replace(/([|\[\]\\])/g, '\\$1');
    const tee = this.targets.map(t => `[f=flv:onfail=ignore:flvflags=no_duration_filesize]${esc(t.url)}`).join('|');
    const args = ['-hide_banner', '-loglevel', 'warning', '-stats', '-listen', '1', '-i', `${this.ingest}/${this.key}`, '-map', '0', '-c', 'copy', '-f', 'tee', tee];
    let p;
    try { p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { this.state = 'error'; this.error = 'Không chạy được ffmpeg: ' + e.message; return; }
    this.proc = p; this.state = 'listening'; this.error = ''; this.startedAt = Date.now();
    let buf = '';
    p.stderr.on('data', d => {
      buf += String(d); const lines = buf.split(/[\r\n]/); buf = lines.pop();
      for (const l of lines) {
        const m = l.match(/time=(\d+:\d+:\d+)/); if (m) { this.streamTime = m[1]; if (this.state !== 'streaming') { this.state = 'streaming'; this.emit('streaming'); } }
        const f = l.match(/Slave muxer #(\d+) failed/); if (f) { this.failed.add(Number(f[1])); this.emit('targetFailed', this.targets[Number(f[1])]?.name, l); }
        if (/Address already in use|bind failed/i.test(l)) this.error = `Cổng ${this.port} đang bận – tắt chương trình đang dùng cổng này`;
      }
    });
    p.on('error', e => { if (this.proc !== p) return; this.proc = null; this.state = 'error'; this.error = e.code === 'ENOENT' ? 'Chưa có ffmpeg – mở Terminal chạy: brew install ffmpeg' : 'ffmpeg lỗi: ' + e.message; this.want = false; });
    p.on('exit', () => {
      if (this.proc !== p) return; this.proc = null;
      const was = this.state; this.streamTime = '';
      if (!this.want) return;
      // OBS dừng phát (hoặc rớt) → ffmpeg thoát; mở lại cổng để lần phát sau tự nối
      this.state = 'listening'; if (was === 'streaming') this.emit('ended');
      this.timer = setTimeout(() => this._spawn(), Date.now() - this.startedAt < 3000 ? 5000 : 800);
    });
  }
}
