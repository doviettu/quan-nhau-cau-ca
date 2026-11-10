// Đọc chat của buổi live YouTube bằng YouTube Data API v3 (chỉ cần API key, không cần đăng nhập).
// Mỗi lần đọc chat tốn 5 đơn vị hạn mức (mặc định 10.000 đơn vị/ngày cho mỗi project), nên app
// đọc thưa theo `minPoll` giây và theo pollingIntervalMillis YouTube gợi ý, lấy giá trị lớn hơn.
// Sự kiện được đổi sang định dạng TikFinity { event, data } giống TikTok để game dùng chung.
import { EventEmitter } from 'node:events';

const API = (process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/+$/, '');

// Nhận: link video/buổi live, ID video 11 ký tự, @handle, link kênh, hoặc ID kênh UC...
export function parseYouTubeInput(s) {
  s = String(s || '').trim();
  let m;
  if ((m = s.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})(?:[?&#/]|$)/))) return { video: m[1] };
  if ((m = s.match(/youtube\.com\/channel\/(UC[\w-]{22})/)) || (m = s.match(/^(UC[\w-]{22})$/))) return { channel: m[1] };
  if ((m = s.match(/youtube\.com\/(@[\w.\-]{3,30})/)) || (m = s.match(/^(@[\w.\-]{3,30})$/))) return { handle: m[1] };
  if ((m = s.match(/^([\w-]{11})$/))) return { video: m[1] };
  return null;
}

// Quy đổi Super Chat sang "xu" (theo giá xu TikTok, khoảng 270 đ một xu) – chỉ để chọn món trong quán ảo
const XU_PER_UNIT = { VND: 1 / 270, USD: 93, EUR: 100, GBP: 118, AUD: 61, CAD: 68, SGD: 69, JPY: 0.62, KRW: 0.068, TWD: 2.9, HKD: 12, THB: 2.6, PHP: 1.6, IDR: 0.0058, MYR: 20, INR: 1.1 };
export function superChatXu(amountMicros, currency) {
  const amt = Number(amountMicros) / 1e6; if (!(amt > 0)) return 1;
  const r = XU_PER_UNIT[String(currency || '').toUpperCase()];
  return Math.max(1, Math.round(r ? amt * r : 50));
}

export class YouTubeSource extends EventEmitter {
  constructor() {
    super();
    Object.assign(this, { state: 'off', error: '', target: null, input: '', videoId: '', title: '', chatId: '', pageToken: '', viewers: 0, likes: -1, units: 0, unitsDay: '', want: false, timer: null, statTimer: null, waitSince: 0, getKey: () => '', referer: '', minPoll: 8, seen: new Set() });
  }
  status() { return { state: this.state, error: this.error, input: this.input, videoId: this.videoId, title: this.title, viewers: this.viewers, unitsToday: this.units }; }
  start(input, { getKey, referer, minPoll } = {}) {
    this.stop();
    this.input = String(input || '').trim(); this.target = parseYouTubeInput(this.input);
    if (getKey) this.getKey = getKey; if (referer) this.referer = referer; this.minPoll = Math.max(5, Number(minPoll) || 8);
    if (!this.target) { this.state = 'error'; this.error = 'Nhập link buổi live, link kênh hoặc @tên kênh YouTube'; return; }
    this.want = true; this.waitSince = Date.now(); this._find();
  }
  stop() {
    this.want = false; clearTimeout(this.timer); clearInterval(this.statTimer); this.statTimer = null;
    Object.assign(this, { state: 'off', error: '', videoId: '', title: '', chatId: '', pageToken: '', viewers: 0, likes: -1 }); this.seen.clear();
  }
  _later(fn, sec) { clearTimeout(this.timer); if (this.want) this.timer = setTimeout(() => fn.call(this), sec * 1000); }
  _cost(n) { const d = new Date().toDateString(); if (d !== this.unitsDay) { this.unitsDay = d; this.units = 0; } this.units += n; }
  async _get(pathq, cost = 1) {
    const key = String(this.getKey() || '').trim(); if (!key) throw Object.assign(new Error('Chưa có YouTube Data API key (dán ở mục Karaoke YouTube)'), { fatal: true });
    this._cost(cost);
    const r = await fetch(`${API}/${pathq}&key=${encodeURIComponent(key)}`, { headers: this.referer ? { referer: this.referer } : {}, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(j?.error?.message || 'HTTP ' + r.status), reason = String(j?.error?.errors?.[0]?.reason || '');
      throw Object.assign(new Error(msg), { status: r.status, reason });
    }
    return j;
  }
  _fail(e, retrySec, fn) {
    const t = String(e.reason || '') + ' ' + String(e.message || e);
    if (/quota/i.test(t)) { this.state = 'error'; this.error = 'Hết hạn mức YouTube API hôm nay – tự thử lại sau 30 phút (nên tạo key riêng cho chat live)'; return this._later(fn, 1800); }
    if (/keyInvalid|API key not valid/i.test(t)) { this.state = 'error'; this.error = 'YouTube API key sai'; this.want = false; return; }
    if (/accessNotConfigured|has not been used|disabled/i.test(t)) { this.state = 'error'; this.error = 'Chưa bật YouTube Data API v3 cho project của key'; this.want = false; return; }
    if (e.fatal) { this.state = 'error'; this.error = e.message; this.want = false; return; }
    this.state = 'error'; this.error = 'Lỗi YouTube: ' + String(e.message || e).slice(0, 140); this._later(fn, retrySec);
  }
  // tìm buổi live đang phát: link video thì dùng luôn; kênh thì xem 5 video mới nhất trong danh sách tải lên (3 đơn vị, rẻ hơn search 100 đơn vị)
  async _find() {
    if (!this.want) return;
    this.state = 'connecting'; this.error = '';
    try {
      let ids = [];
      if (this.target.video) ids = [this.target.video];
      else {
        const q = this.target.handle ? `forHandle=${encodeURIComponent(this.target.handle)}` : `id=${this.target.channel}`;
        const ch = await this._get(`channels?part=contentDetails&${q}`);
        const up = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!up) throw Object.assign(new Error('Không tìm thấy kênh YouTube này'), { fatal: true });
        const pl = await this._get(`playlistItems?part=contentDetails&maxResults=5&playlistId=${up}`);
        ids = (pl.items || []).map(x => x.contentDetails?.videoId).filter(Boolean);
      }
      const vs = ids.length ? await this._get(`videos?part=snippet,liveStreamingDetails&id=${ids.join(',')}`) : { items: [] };
      const v = (vs.items || []).find(x => x.liveStreamingDetails?.activeLiveChatId && !x.liveStreamingDetails?.actualEndTime);
      if (!v) {
        this.state = 'offline';
        const waited = Date.now() - this.waitSince, sec = waited < 600000 ? 60 : 300;   // 10 phút đầu thử mỗi phút, sau đó 5 phút một lần
        this.error = (this.target.video ? 'Video này chưa live hoặc đã kết thúc' : 'Kênh chưa có buổi live đang phát') + ` – tự thử lại sau ${sec >= 300 ? '5 phút' : '1 phút'}`;
        return this._later(this._find, sec);
      }
      Object.assign(this, { videoId: v.id, title: v.snippet?.title || '', chatId: v.liveStreamingDetails.activeLiveChatId, pageToken: '', viewers: Number(v.liveStreamingDetails.concurrentViewers) || 0, likes: -1 });
      this.state = 'live'; this.error = ''; this.first = true; this.emit('connected');
      clearInterval(this.statTimer); this.statTimer = setInterval(() => this._stats(), 90000); this._stats();
      this._poll();
    } catch (e) { this._fail(e, 60, this._find); }
  }
  // số người xem + tổng lượt thích (1 đơn vị): lượt thích tăng thêm được gửi vào game làm tim chung
  async _stats() {
    if (!this.want || !this.videoId) return;
    try {
      const j = await this._get(`videos?part=statistics,liveStreamingDetails&id=${this.videoId}`);
      const v = j.items?.[0]; if (!v) return;
      this.viewers = Number(v.liveStreamingDetails?.concurrentViewers) || 0;
      const lk = Number(v.statistics?.likeCount);
      if (Number.isFinite(lk)) { if (this.likes >= 0 && lk > this.likes) this.emit('event', { event: 'likeAnon', data: { platform: 'youtube', count: Math.min(500, lk - this.likes) } }); this.likes = lk; }
    } catch { }
  }
  async _poll() {
    if (!this.want || !this.chatId) return;
    let wait = this.minPoll;
    try {
      const j = await this._get(`liveChat/messages?part=snippet,authorDetails&maxResults=200&liveChatId=${encodeURIComponent(this.chatId)}${this.pageToken ? '&pageToken=' + encodeURIComponent(this.pageToken) : ''}`, 5);
      this.pageToken = j.nextPageToken || this.pageToken;
      // lần đọc đầu chỉ lấy mốc, không phát lại tin nhắn cũ trước khi app kết nối
      if (!this.first) for (const m of j.items || []) this._emitMsg(m);
      this.first = false;
      if (j.offlineAt) return this._ended();
      wait = Math.max(this.minPoll, (Number(j.pollingIntervalMillis) || 0) / 1000);
      if (this.state !== 'live') { this.state = 'live'; this.error = ''; }
    } catch (e) {
      if (/liveChatEnded|liveChatNotFound|liveChatDisabled/i.test(String(e.reason)) || e.status === 404) return this._ended();
      return this._fail(e, 20, this._poll);
    }
    this._later(this._poll, wait);
  }
  _ended() {
    clearInterval(this.statTimer); this.statTimer = null;
    Object.assign(this, { state: 'offline', error: 'Buổi live YouTube đã kết thúc – tự tìm buổi live mới', chatId: '', videoId: '', pageToken: '' });
    this.waitSince = Date.now(); this._later(this._find, 60);
  }
  _emitMsg(m) {
    if (!m || this.seen.has(m.id)) return; this.seen.add(m.id); if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-800));
    const s = m.snippet || {}, a = m.authorDetails || {};
    if (a.isChatOwner) return;   // tin của chính kênh (chủ quán) không tính là khách
    const user = { uniqueId: 'yt:' + (a.channelId || s.authorChannelId || a.displayName), nickname: String(a.displayName || 'Khách YouTube').replace(/^@/, ''), userId: 'yt:' + (a.channelId || ''), platform: 'youtube' };
    const text = s.displayMessage || s.textMessageDetails?.messageText || '';
    const emit = (event, data) => this.emit('event', { event, data: { ...user, ...data } });
    switch (s.type) {
      case 'textMessageEvent': if (text) emit('chat', { comment: text }); break;
      case 'superChatEvent': case 'superStickerEvent': {
        const d = s.superChatDetails || s.superStickerDetails || {};
        emit('gift', { giftName: s.type === 'superChatEvent' ? 'Super Chat' : 'Super Sticker', repeatCount: 1, repeatEnd: true, diamondCount: superChatXu(d.amountMicros, d.currency), amount: d.amountDisplayString || '' });
        if (d.userComment) emit('chat', { comment: d.userComment });
        break;
      }
      case 'newSponsorEvent': emit('follow', {}); break;
      case 'memberMilestoneChatEvent': emit('follow', {}); if (s.memberMilestoneChatDetails?.userComment) emit('chat', { comment: s.memberMilestoneChatDetails.userComment }); break;
      case 'membershipGiftingEvent': emit('gift', { giftName: 'Tặng hội viên', repeatCount: Math.max(1, Number(s.membershipGiftingDetails?.giftMembershipsCount) || 1), repeatEnd: true, diamondCount: 400 }); break;
    }
  }
}
