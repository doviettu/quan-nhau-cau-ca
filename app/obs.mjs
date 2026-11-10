// Điều khiển OBS qua obs-websocket v5 (có sẵn trong OBS 28 trở lên: Tools → WebSocket Server Settings).
// "Khớp lại OBS": tạo cảnh dọc, chụp đúng cửa sổ game, thu tiếng máy, và đặt OBS phát về bộ chuyển tiếp
// trên máy (app/relay.mjs) để từ đó phát lên YouTube, Facebook, TikTok cùng lúc.
import WebSocket from 'ws';
import crypto from 'node:crypto';

const b64sha = s => crypto.createHash('sha256').update(s).digest('base64');
export const SCENE = 'Cậu Cả Live';
export const VIDEO_INPUT = 'Cậu Cả – Cửa sổ game';
export const AUDIO_INPUT = 'Cậu Cả – Âm thanh máy';
const GAME_TITLES = ['quán nhậu vỉa hè cậu cả', 'cậu cả'];   // tiêu đề cửa sổ game (thẻ <title> của index.html)
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      ws.on('error', e => fail(new Error('Không kết nối được OBS tại ' + url + ': ' + e.message + ' – mở OBS và bật WebSocket server')));
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

  async ensureInput(sceneName, inputName, inputKind, inputSettings) {
    try { return (await this.request('CreateInput', { sceneName, inputName, inputKind, inputSettings, sceneItemEnabled: true })).sceneItemId; }
    catch (e) {
      if (e.code !== 601) throw e;   // 601 = nguồn cùng tên đã có → dùng lại
      await this.request('SetInputSettings', { inputName, inputSettings, overlay: true });
      const { sceneItems = [] } = await this.request('GetSceneItemList', { sceneName });
      const it = sceneItems.find(i => i.sourceName === inputName);
      return it ? it.sceneItemId : (await this.request('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true })).sceneItemId;
    }
  }

  // Khớp lại toàn bộ: khung hình, cảnh, cửa sổ game, âm thanh, đích phát (bộ chuyển tiếp trên máy), bitrate
  async sync({ width = 720, height = 1280, bitrate = 3500, server, key }) {
    const warnings = [], done = [];
    const st = await this.request('GetStreamStatus').catch(() => ({}));
    if (st.outputActive) warnings.push('OBS đang phát – khung hình, đích phát và bitrate chỉ đổi được khi dừng phát. Cảnh và cửa sổ game vẫn được khớp lại.');
    else {
      try { await this.request('SetVideoSettings', { baseWidth: width, baseHeight: height, outputWidth: width, outputHeight: height, fpsNumerator: 30, fpsDenominator: 1 }); done.push(`khung ${width}×${height}, 30 FPS`); }
      catch (e) { warnings.push(`Chưa đổi được khung hình ${width}×${height}: ${e.message}`); }
    }
    const { scenes = [] } = await this.request('GetSceneList');
    if (!scenes.some(s => s.sceneName === SCENE)) await this.request('CreateScene', { sceneName: SCENE });
    await this.request('SetCurrentProgramScene', { sceneName: SCENE });
    done.push(`cảnh "${SCENE}"`);

    // nguồn hình: chụp cửa sổ game (macOS Screen Capture, chế độ cửa sổ)
    const { inputKinds = [] } = await this.request('GetInputKindList', { unversioned: true }).catch(() => ({}));
    const vKind = inputKinds.includes('screen_capture') ? 'screen_capture' : inputKinds.includes('window_capture') ? 'window_capture' : null;
    let windowName = '';
    if (!vKind) warnings.push('OBS này không có nguồn chụp cửa sổ của macOS – cập nhật OBS bản 30 trở lên');
    else {
      const itemId = await this.ensureInput(SCENE, VIDEO_INPUT, vKind, vKind === 'screen_capture' ? { type: 1, show_cursor: false } : { show_shadow: false });
      let win = null;
      try {
        const { propertyItems = [] } = await this.request('GetInputPropertiesListPropertyItems', { inputName: VIDEO_INPUT, propertyName: 'window' });
        const norm = s => String(s || '').normalize('NFC').toLowerCase();
        win = propertyItems.find(i => i.itemEnabled !== false && GAME_TITLES.some(t => norm(i.itemName).includes(t)));
      } catch (e) { warnings.push('Không đọc được danh sách cửa sổ trong OBS: ' + e.message); }
      if (!win) warnings.push('Chưa thấy cửa sổ game – bấm “🪟 Mở cửa sổ game” rồi bấm “Khớp lại OBS” lần nữa. Cấp quyền Ghi màn hình cho OBS nếu macOS hỏi.');
      else {
        windowName = win.itemName;
        await this.request('SetInputSettings', { inputName: VIDEO_INPUT, inputSettings: vKind === 'screen_capture' ? { type: 1, window: win.itemValue, show_cursor: false } : { window: win.itemValue }, overlay: true });
        done.push(`chụp cửa sổ "${windowName}"`);
      }
      // phủ kín khung; cắt thanh tiêu đề cửa sổ Chrome ở cạnh trên (phần thừa so với tỉ lệ 9:16)
      let tf = {};
      for (let i = 0; i < 8; i++) { tf = (await this.request('GetSceneItemTransform', { sceneName: SCENE, sceneItemId: itemId }).catch(() => ({}))).sceneItemTransform || {}; if (tf.sourceWidth > 0) break; await sleep(300); }
      const sw = tf.sourceWidth || 0, sh = tf.sourceHeight || 0;
      const cropTop = sw && sh > sw * 16 / 9 ? Math.min(Math.round(sh - sw * 16 / 9), Math.round(sh * 0.12)) : 0;
      await this.request('SetSceneItemTransform', { sceneName: SCENE, sceneItemId: itemId, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, cropTop, cropBottom: 0, cropLeft: 0, cropRight: 0, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: width, boundsHeight: height } });
      if (cropTop) done.push(`cắt ${cropTop}px thanh tiêu đề`);
    }

    // nguồn tiếng: toàn bộ âm thanh máy (gồm nhạc game trong Chrome và giọng Cậu Cả phát bằng chương trình riêng)
    if (inputKinds.includes('sck_audio_capture')) { await this.ensureInput(SCENE, AUDIO_INPUT, 'sck_audio_capture', { type: 0 }); done.push('thu toàn bộ âm thanh máy'); }
    else warnings.push('OBS chưa có nguồn "macOS Audio Capture" (cần OBS 30+ và macOS 13+) – tự thêm nguồn thu âm thanh máy, nếu không live sẽ không có tiếng');

    // đích phát: bộ chuyển tiếp trên máy + bitrate, bộ mã hoá phần cứng của Mac
    if (!st.outputActive && server) {
      try { await this.request('SetStreamServiceSettings', { streamServiceType: 'rtmp_custom', streamServiceSettings: { server, key, use_auth: false } }); done.push('đích phát → bộ chuyển tiếp của app'); }
      catch (e) { warnings.push('Chưa đặt được đích phát: ' + e.message); }
      const prof = [['Output', 'Mode', 'Simple'], ['SimpleOutput', 'VBitrate', String(bitrate)], ['SimpleOutput', 'StreamEncoder', 'apple_h264'], ['SimpleOutput', 'ABitrate', '160']];
      let okProf = true;
      for (const [parameterCategory, parameterName, parameterValue] of prof) await this.request('SetProfileParameter', { parameterCategory, parameterName, parameterValue }).catch(() => { okProf = false; });
      if (okProf) done.push(`bitrate ${bitrate} Kbps, bộ mã hoá Apple VT`); else warnings.push('Chưa đặt được bitrate/bộ mã hoá – vào OBS → Settings → Output chỉnh tay');
    }
    return { ok: true, windowName, done, warnings };
  }

  async streamStatus() { const s = await this.request('GetStreamStatus'); return { active: !!s.outputActive, timecode: s.outputTimecode || '', reconnecting: !!s.outputReconnecting }; }
  async startStream() { await this.request('StartStream'); }
  async stopStream() { await this.request('StopStream'); }
}
