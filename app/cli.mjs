// Lệnh nhanh khi app đang chạy:  npm run status | obs:setup | obs:start | obs:stop
const port = Number(process.env.PORT || 8686), base = `http://127.0.0.1:${port}`;
const [cmd] = process.argv.slice(2);
const call = async (p, b) => {
  const r = await fetch(base + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined);
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};
try {
  if (cmd === 'status') {
    const s = await call('/api/status');
    console.log(`Claude: ${s.claudeReady ? '✅' : '⚠️ chưa có key'} · TikFinity: ${s.tikfinity ? '✅' : '❌'} · OBS: ${s.obs.connected ? '✅' : '❌ ' + (s.obs.err || '')} · Đang phát: ${s.obs.stream.active ? '🔴 ' + s.obs.stream.timecode : 'không'}`);
    console.log(`Game trong OBS: ${s.gameAge !== null && s.gameAge < 6000 ? '✅' : '❌ chưa thấy'}${s.game ? ` · khách thật ${s.game.real}, khách quen ${s.game.bots}, không khí ${s.game.vibe}%` : ''}`);
  } else if (cmd === 'obs-setup') { const r = await call('/api/obs/setup', {}); console.log(`✅ Đã tạo cảnh "${r.sceneName}" ${r.width}×${r.height}`); r.warnings.forEach(w => console.log('⚠️ ' + w)); }
  else if (cmd === 'obs-start') { await call('/api/obs/stream', { action: 'start' }); console.log('🔴 Đã bắt đầu phát'); }
  else if (cmd === 'obs-stop') { await call('/api/obs/stream', { action: 'stop' }); console.log('⏹ Đã dừng phát'); }
  else console.log('Dùng: npm run status | obs:setup | obs:start | obs:stop');
} catch (e) { console.error('❌ ' + (e.cause && e.cause.code === 'ECONNREFUSED' ? 'App chưa chạy – mở "Cau Ca Live.app" hoặc chạy ./start.command' : e.message)); process.exit(1); }
