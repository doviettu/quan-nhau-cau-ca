// Lệnh nhanh khi app đang chạy:  npm run status | npm run window
const port = Number(process.env.PORT || 8686), base = `http://127.0.0.1:${port}`;
const [cmd] = process.argv.slice(2);
const call = async (p, b) => {
  const r = await fetch(base + p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : undefined);
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};
try {
  if (cmd === 'status') {
    const s = await call('/api/status'); const t = s.tiktok || {};
    const live = t.on ? (t.state === 'live' ? `✅ @${t.username} · ${t.viewers} người xem` : `⚠️ @${t.username}: ${t.error || t.state}`) : (s.tikfinity ? '✅ qua TikFinity' : '❌ chưa kết nối');
    console.log(`Claude: ${s.claudeReady ? '✅' : '⚠️ chưa có key'} · TikTok: ${live}`);
    console.log(`Cửa sổ game: ${s.gameAge !== null && s.gameAge < 6000 ? '✅' : '❌ chưa mở'}${s.game ? ` · khách thật ${s.game.real}, khách quen ${s.game.bots}, không khí ${s.game.vibe}%` : ''}`);
  } else if (cmd === 'window') { const r = await call('/api/window/open', {}); console.log(r.ok ? '🪟 Đã mở cửa sổ game' + (r.warning ? ' – ⚠️ ' + r.warning : '') : '❌ ' + r.error); }
  else console.log('Dùng: npm run status | npm run window');
} catch (e) { console.error('❌ ' + (e.cause && e.cause.code === 'ECONNREFUSED' ? 'App chưa chạy – mở "Cau Ca Live.app" hoặc chạy ./start.command' : e.message)); process.exit(1); }
