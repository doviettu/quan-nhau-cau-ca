// Điều khiển OBS qua obs-websocket v5 (có sẵn trong OBS 28 trở lên: Tools → WebSocket Server Settings)
import WebSocket from 'ws';
import crypto from 'node:crypto';

const b64sha = s => crypto.createHash('sha256').update(s).digest('base64');
export const INPUT_NAME = 'Cậu Cả – Game';

export class ObsClient {
  constructor() { this.ws = null; this.connected = false; this.pending = new Map(); this.seq = 0; this.err = ''; this.url = ''; }

  async connect(url, password) {
    if (this.connected && this.url === url) return;
    this.close();
    this.url = url;
    await new Promise((resolve, reject) => {
      let done = false;
      const fail = e => { if (done) return; done = true; clearTimeout(timer); this.err = e.message; reject(e); };
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.terminate(); fail(new Error('OBS không phản hồi – mở OBS và bật Tools → WebSocket Server Settings → Enable WebSocket server')); }, 5000);
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.op === 0) {   // Hello
          const ident = { rpcVersion: 1, eventSubscriptions: 0 };
          const a = m.d && m.d.authentication;
          if (a) {
            if (!password) { ws.close(); return fail(new Error('OBS yêu cầu mật khẩu WebSocket – nhập trong bảng điều khiển')); }
            ident.authentication = b64sha(b64sha(password + a.salt) + a.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d: ident }));
        } else if (m.op === 2) {   // Identified
          done = true; clearTimeout(timer); this.ws = ws; this.connected = true; this.err = ''; resolve();
        } else if (m.op === 7) {   // RequestResponse
          const p = this.pending.get(m.d.requestId); if (!p) return;
          this.pending.delete(m.d.requestId);
          const st = m.d.requestStatus || {};
          if (st.result) p.resolve(m.d.responseData || {});
          else p.reject(Object.assign(new Error(st.comment || ('OBS báo lỗi mã ' + st.code)), { code: st.code }));
        }
      });
      ws.on('close', code => {
        this.connected = false; if (this.ws === ws) this.ws = null;
        for (const p of this.pending.values()) p.reject(new Error('Mất kết nối OBS')); this.pending.clear();
        fail(new Error(code === 4009 ? 'Sai mật khẩu OBS WebSocket' : 'OBS đóng kết nối (mã ' + code + ')'));
      });
      ws.on('error', e => fail(new Error('Không kết nối được OBS tại ' + url + ': ' + e.message)));
    });
  }

  close() { try { this.ws && this.ws.close(); } catch { } this.ws = null; this.connected = false; }

  request(requestType, requestData = {}) {
    if (!this.connected || !this.ws) return Promise.reject(new Error('Chưa kết nối OBS'));
    const requestId = 'r' + (++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => { if (this.pending.delete(requestId)) reject(new Error('OBS không phản hồi lệnh ' + requestType)); }, 8000);
    });
  }

  // Tạo/cập nhật cảnh live: khung dọc 1080×1920 (TikTok), nguồn trình duyệt chạy game, âm thanh game vào OBS
  async setupScene({ sceneName, vertical }, gameUrl) {
    const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080, warnings = [];
    try { await this.request('SetVideoSettings', { baseWidth: W, baseHeight: H, outputWidth: W, outputHeight: H }); }
    catch (e) { warnings.push('Chưa đổi được khung hình ' + W + '×' + H + ' (tắt phát/ghi hình rồi thử lại): ' + e.message); }
    const { scenes = [] } = await this.request('GetSceneList');
    if (!scenes.some(s => s.sceneName === sceneName)) await this.request('CreateScene', { sceneName });
    const inputSettings = { url: gameUrl, width: W, height: H, reroute_audio: true, restart_when_active: false, shutdown: false, fps_custom: true, fps: 30 };
    let sceneItemId;
    try {
      ({ sceneItemId } = await this.request('CreateInput', { sceneName, inputName: INPUT_NAME, inputKind: 'browser_source', inputSettings, sceneItemEnabled: true }));
    } catch (e) {
      if (e.code !== 601) throw e;   // 601 = nguồn đã tồn tại → cập nhật lại
      await this.request('SetInputSettings', { inputName: INPUT_NAME, inputSettings, overlay: true });
      const { sceneItems = [] } = await this.request('GetSceneItemList', { sceneName });
      const it = sceneItems.find(i => i.sourceName === INPUT_NAME);
      sceneItemId = it ? it.sceneItemId : (await this.request('CreateSceneItem', { sceneName, sourceName: INPUT_NAME, sceneItemEnabled: true })).sceneItemId;
    }
    await this.request('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: W, boundsHeight: H } });
    await this.request('SetCurrentProgramScene', { sceneName });
    return { sceneName, inputName: INPUT_NAME, width: W, height: H, warnings };
  }

  async refreshGame() { await this.request('PressInputPropertiesButton', { inputName: INPUT_NAME, propertyName: 'refreshnocache' }); }
  async streamStatus() { const s = await this.request('GetStreamStatus'); return { active: !!s.outputActive, timecode: s.outputTimecode || '' }; }
  async startStream() { await this.request('StartStream'); }
  async stopStream() { await this.request('StopStream'); }
}
