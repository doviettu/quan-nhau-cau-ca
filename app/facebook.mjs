// Đọc comment (và lượt bày tỏ cảm xúc nếu Facebook cho phép) của buổi live trên Trang Facebook
// bằng Graph API: cần Page access token của chính Trang (lưu trong Keychain, không vào trình duyệt).
// Comment nhận theo luồng server-sent events từ streaming-graph.facebook.com.
// Sự kiện được đổi sang định dạng TikFinity { event, data } giống TikTok để game dùng chung.
import { EventEmitter } from 'node:events';

const GRAPH = (process.env.FB_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');
const STREAM = (process.env.FB_STREAM_BASE || 'https://streaming-graph.facebook.com').replace(/\/+$/, '');

// Nhận: ID Trang, tên Trang (facebook.com/tentrang), hoặc để trống = Trang của token
export function parsePage(s) {
  s = String(s || '').trim();
  if (!s) return 'me';
  const m = s.match(/facebook\.com\/(?:profile\.php\?id=(\d+)|([\w.\-]+))/i);
  const v = m ? (m[1] || m[2]) : s.replace(/^@/, '');
  return /^[\w.\-]{2,80}$/.test(v) ? v : null;
}

export class FacebookSource extends EventEmitter {
  constructor() {
    super();
    Object.assign(this, { state: 'off', error: '', page: '', pageName: '', liveId: '', title: '', viewers: 0, want: false, timer: null, statTimer: null, aborts: [], getToken: () => '', waitSince: 0, seen: new Set(), lastReact: {} });
  }
  status() { return { state: this.state, error: this.error, page: this.page, pageName: this.pageName, liveId: this.liveId, title: this.title, viewers: this.viewers }; }
  start(page, { getToken } = {}) {
    this.stop();
    if (getToken) this.getToken = getToken;
    this.page = parsePage(page);
    if (!this.page) { this.state = 'error'; this.error = 'Tên hoặc ID Trang Facebook không hợp lệ'; return; }
    this.want = true; this.waitSince = Date.now(); this._find();
  }
  stop() {
    this.want = false; clearTimeout(this.timer); clearInterval(this.statTimer); this.statTimer = null;
    for (const a of this.aborts) try { a.abort(); } catch { }
    this.aborts = []; this.seen.clear();
    Object.assign(this, { state: 'off', error: '', liveId: '', title: '', viewers: 0 });
  }
  _later(fn, sec) { clearTimeout(this.timer); if (this.want) this.timer = setTimeout(() => fn.call(this), sec * 1000); }
  async _get(pathq) {
    const tok = String(this.getToken() || '').trim(); if (!tok) throw Object.assign(new Error('Chưa lưu Page access token'), { fatal: true });
    const r = await fetch(`${GRAPH}/${pathq}${pathq.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(tok)}`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = j.error || {}; throw Object.assign(new Error(String(e.message || 'HTTP ' + r.status)), { code: e.code, sub: e.error_subcode, status: r.status }); }
    return j;
  }
  _fail(e, retrySec, fn) {
    if (e.fatal || e.code === 190) { this.state = 'error'; this.error = e.code === 190 ? 'Page access token hết hạn hoặc sai – lấy token mới rồi lưu lại' : e.message; this.want = false; return; }
    if (e.code === 10 || e.code === 200 || /permission/i.test(e.message)) { this.state = 'error'; this.error = 'Token thiếu quyền (cần pages_read_engagement, pages_read_user_content): ' + String(e.message).slice(0, 100); this.want = false; return; }
    if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) { this.state = 'error'; this.error = 'Facebook đang giới hạn lượt gọi – thử lại sau 5 phút'; return this._later(fn, 300); }
    this.state = 'error'; this.error = 'Lỗi Facebook: ' + String(e.message || e).slice(0, 140); this._later(fn, retrySec);
  }
  async _find() {
    if (!this.want) return;
    this.state = 'connecting'; this.error = '';
    try {
      if (!this.pageName) { const me = await this._get(`${encodeURIComponent(this.page)}?fields=id,name`); this.pageName = me.name || ''; this.pageId = me.id; }
      const j = await this._get(`${encodeURIComponent(this.pageId || this.page)}/live_videos?broadcast_status=${encodeURIComponent('["LIVE"]')}&fields=id,title,status,live_views&limit=5`);
      const v = (j.data || []).find(x => x.status === 'LIVE') || (j.data || [])[0];
      if (!v) {
        this.state = 'offline';
        const sec = Date.now() - this.waitSince < 600000 ? 30 : 120;
        this.error = `Trang chưa có buổi live đang phát – tự thử lại sau ${sec} giây`;
        return this._later(this._find, sec);
      }
      Object.assign(this, { liveId: v.id, title: v.title || '', viewers: Number(v.live_views) || 0 });
      this.state = 'live'; this.error = ''; this.emit('connected');
      this._comments(); this._reactions();
      clearInterval(this.statTimer); this.statTimer = setInterval(() => this._stats(), 60000);
    } catch (e) { this._fail(e, 60, this._find); }
  }
  async _stats() {
    if (!this.want || !this.liveId) return;
    try {
      const v = await this._get(`${this.liveId}?fields=status,live_views`);
      this.viewers = Number(v.live_views) || 0;
      if (v.status && v.status !== 'LIVE') this._ended();
    } catch (e) { if (e.code === 100) this._ended(); }
  }
  _ended() {
    for (const a of this.aborts) try { a.abort(); } catch { }
    this.aborts = []; clearInterval(this.statTimer); this.statTimer = null;
    Object.assign(this, { state: 'offline', error: 'Buổi live Facebook đã kết thúc – tự tìm buổi live mới', liveId: '' });
    this.waitSince = Date.now(); this._later(this._find, 30);
  }
  // đọc luồng server-sent events; tự nối lại khi rớt (nếu buổi live vẫn đang phát)
  async _sse(edge, query, onData, onFail) {
    const id = this.liveId; if (!id || !this.want) return;
    const ac = new AbortController(); this.aborts.push(ac);
    const tok = String(this.getToken() || '').trim();
    try {
      const r = await fetch(`${STREAM}/${id}/${edge}?${query}&access_token=${encodeURIComponent(tok)}`, { headers: { accept: 'text/event-stream' }, signal: ac.signal });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j?.error?.message || 'HTTP ' + r.status), { code: j?.error?.code, status: r.status }); }
      const dec = new TextDecoder(); let buf = '';
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
          if (data) { try { onData(JSON.parse(data)); } catch { } }
        }
      }
    } catch (e) {
      if (ac.signal.aborted || !this.want || this.liveId !== id) return;
      if (onFail && onFail(e) === false) return;
    } finally { this.aborts = this.aborts.filter(a => a !== ac); }
    if (this.want && this.liveId === id) setTimeout(() => this.liveId === id && this._sse(edge, query, onData, onFail), 5000);
  }
  _comments() {
    this._sse('live_comments', 'comment_rate=ten_per_second&fields=' + encodeURIComponent('id,message,from{id,name}'), c => {
      if (!c || !c.id || this.seen.has(c.id)) return; this.seen.add(c.id); if (this.seen.size > 3000) this.seen = new Set([...this.seen].slice(-1000));
      const f = c.from || {};
      if (this.pageId && f.id === this.pageId) return;   // comment của chính Trang (chủ quán)
      const uid = f.id ? 'fb:' + f.id : 'fb:anon:' + String(c.id).split('_').pop();
      if (c.message) this.emit('event', { event: 'chat', data: { uniqueId: uid, userId: uid, nickname: f.name || 'Khách Facebook', platform: 'facebook', comment: c.message } });
    }, e => {
      if (e.code === 190) { this.state = 'error'; this.error = 'Page access token hết hạn – lấy token mới rồi lưu lại'; this.want = false; return false; }
      if (e.status === 400 || e.status === 404) { this._ended(); return false; }
    });
  }
  // lượt bày tỏ cảm xúc: Facebook gửi tổng theo từng loại, không kèm tên người – đưa vào game thành "tim chung"
  _reactions() {
    this.lastReact = {}; this.reactPerTick = false;
    this._sse('live_reactions', 'fields=reaction_stream', d => {
      const list = d.reaction_stream || d.data || [];
      let add = 0;
      for (const x of Array.isArray(list) ? list : []) {
        const k = x.key || x.type, n = Number(x.value ?? x.count) || 0;
        if (!k) continue;
        // chưa rõ Facebook gửi tổng cộng dồn hay số mới trong mỗi nhịp: thấy số giảm thì coi là số mới mỗi nhịp
        const prev = this.lastReact[k];
        if (prev === undefined) { if (this.reactPerTick) add += n; }
        else if (n >= prev && !this.reactPerTick) add += n - prev;
        else { this.reactPerTick = true; add += n; }
        this.lastReact[k] = n;
      }
      if (add > 0) this.emit('event', { event: 'likeAnon', data: { platform: 'facebook', count: Math.min(500, add) } });
    }, () => false);   // không có quyền hoặc Facebook không hỗ trợ thì bỏ qua, comment vẫn chạy
  }
}
