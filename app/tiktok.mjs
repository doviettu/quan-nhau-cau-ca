// Kết nối thẳng vào phiên TikTok LIVE bằng @tên tài khoản (không cần TikFinity).
// Dùng thư viện mã nguồn mở tiktok-live-connector; thư viện nhờ dịch vụ Euler Stream
// ký kết nối (chỉ gửi tên tài khoản công khai, không cần đăng nhập TikTok).
// Sự kiện được đổi sang đúng định dạng TikFinity { event, data } để game dùng chung.
import { EventEmitter } from 'node:events';

export const normalizeUser = s => String(s || '').trim().replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '').replace(/^@/, '').replace(/\/live\/?$/i, '').replace(/[/?#].*$/, '');
export const validUser = s => /^[A-Za-z0-9._]{2,24}$/.test(s);

const userOf = d => { const u = d.user || {}; return { uniqueId: u.uniqueId || d.uniqueId || '', nickname: u.nickname || d.nickname || u.uniqueId || '', userId: String(u.userId || d.userId || '') }; };

export class TikTokSource extends EventEmitter {
  constructor() { super(); this.state = 'off'; this.username = ''; this.error = ''; this.viewers = 0; this.conn = null; this.want = false; this.timer = null; this.connectedAt = 0; }
  status() { return { state: this.state, username: this.username, error: this.error, viewers: this.viewers }; }
  start(username) {
    this.stop();
    this.username = normalizeUser(username);
    if (!validUser(this.username)) { this.state = 'error'; this.error = 'Tên TikTok không hợp lệ'; return; }
    this.want = true; this._connect();
  }
  stop() {
    this.want = false; clearTimeout(this.timer);
    const c = this.conn; this.conn = null; try { c && c.disconnect(); } catch { }
    this.state = 'off'; this.error = ''; this.viewers = 0;
  }
  _retry(sec) { clearTimeout(this.timer); if (this.want) this.timer = setTimeout(() => this._connect(), sec * 1000); }
  async _connect() {
    if (!this.want) return;
    let lib;
    try { lib = await import('tiktok-live-connector'); }
    catch { this.state = 'error'; this.error = 'Thiếu thư viện kết nối TikTok – tắt app rồi mở lại start.command để tự cài (cần Node.js 20+)'; return; }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    this.state = 'connecting'; this.error = '';
    const c = new TikTokLiveConnection(this.username, { signApiKey: process.env.EULER_API_KEY || undefined, processInitialData: false });
    this.conn = c;
    const emit = (event, data) => { if (this.conn === c) this.emit('event', { event, data }); };
    c.on(WebcastEvent.CHAT, d => emit('chat', { ...userOf(d), comment: d.comment || '' }));
    c.on(WebcastEvent.GIFT, d => {
      const g = d.giftDetails || {}, x = d.extendedGiftInfo || {};
      emit('gift', { ...userOf(d), giftId: d.giftId, giftName: g.giftName || x.name || String(d.giftId || 'Quà'), giftType: g.giftType ?? x.type, repeatCount: d.repeatCount || 1, repeatEnd: !!d.repeatEnd, diamondCount: g.diamondCount || x.diamond_count || 1 });
    });
    c.on(WebcastEvent.LIKE, d => emit('like', { ...userOf(d), likeCount: d.likeCount || 1 }));
    c.on(WebcastEvent.MEMBER, d => emit('member', userOf(d)));
    c.on(WebcastEvent.FOLLOW, d => emit('follow', userOf(d)));
    c.on(WebcastEvent.SHARE, d => emit('share', userOf(d)));
    c.on(WebcastEvent.ROOM_USER, d => { if (this.conn === c) this.viewers = Number(d.viewerCount) || this.viewers; });
    c.on(WebcastEvent.STREAM_END, () => { if (this.conn !== c) return; this.state = 'offline'; this.error = 'Phiên live đã kết thúc – tự kết nối lại khi bạn live tiếp'; this._retry(30); });
    c.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== c || !this.want || this.state === 'offline') return;
      this.state = 'connecting'; this.error = 'Mất kết nối – đang thử lại'; this._retry(8);
    });
    c.on(ControlEvent.ERROR, () => { });
    try {
      await c.connect();
      if (this.conn !== c) { try { c.disconnect(); } catch { } return; }
      this.state = 'live'; this.error = ''; this.connectedAt = Date.now();
      this.emit('connected');
    } catch (e) {
      if (this.conn !== c) return;
      const name = e?.constructor?.name || '', msg = String(e?.message || e);
      if (name === 'UserOfflineError' || /offline|not.*live|isn't live/i.test(msg)) { this.state = 'offline'; this.error = `@${this.username} chưa live – tự thử lại mỗi 30 giây`; this._retry(30); }
      else if (/rate.?limit/i.test(name + msg)) { this.state = 'error'; this.error = 'Dịch vụ ký kết nối đang giới hạn lượt – thử lại sau 60 giây'; this._retry(60); }
      else { this.state = 'error'; this.error = 'Không kết nối được: ' + msg.slice(0, 160); this._retry(20); }
    }
  }
}
