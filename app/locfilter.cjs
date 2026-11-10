// Lọc từ tục tĩu / xúc phạm tiếng Việt (có dấu, không dấu, viết tắt, chèn dấu chấm) và tiếng Anh thường gặp.
// Dùng chung cho game (index.html nạp file này) và app Node (import trong server.mjs).
// Trả về { bad, text }: text là bản đã thay từ xấu bằng "***".
(function (root) {
  // từ có dấu: chỉ khớp đúng chữ có dấu để không bắt nhầm "lon bia", "đeo kính", "con chó nhà em"
  const BAD_VI = ['lồn', 'buồi', 'cặc', 'cặt', 'đụ', 'địt', 'đéo', 'đĩ', 'điếm', 'óc chó', 'súc vật', 'súc sinh', 'đồ ngu', 'thằng ngu', 'con ngu', 'ngu như chó', 'ngu như bò',
    'chó má', 'khốn nạn', 'mẹ mày', 'má mày', 'bố mày', 'cha mày', 'đĩ điếm', 'mặt lồn', 'đầu buồi', 'vãi lồn', 'vãi cả lồn', 'cái lồn', 'con cặc', 'đồ chó', 'thằng chó', 'con chó cái'];
  // viết tắt / không dấu (so sau khi bỏ dấu, gộp dấu chấm chen giữa: "đ.m" → "dm")
  const BAD_ASCII = new Set(['dm', 'dmm', 'dcm', 'dkm', 'dcmm', 'dmcs', 'cdm', 'vcl', 'vkl', 'vl', 'vcc', 'vclm', 'cmm', 'clm', 'clmm', 'cc', 'loz', 'l0n', 'cak',
    'ditme', 'dume', 'duma', 'dmay', 'dcmay', 'fuck', 'fck', 'fuk', 'fucking', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'nigga', 'nigger', 'motherfucker']);
  const BAD_PAIRS = [['dit', 'me'], ['dit', 'ma'], ['dit', 'cha'], ['dit', 'bo'], ['du', 'ma'], ['du', 'me'], ['dit', 'con'], ['con', 'cac'], ['cai', 'lon'], ['vai', 'lon']];
  const isLetter = c => /[\p{L}\p{N}]/u.test(c);
  const baseOf = c => { const b = c.normalize('NFD').replace(/[̀-ͯ]/g, ''); return b === 'đ' ? 'd' : (b[0] || c); };
  function badFilter(input) {
    const chars = [...String(input == null ? '' : input).normalize('NFC')];
    const low = chars.map(c => c.toLowerCase()), base = low.map(baseOf), n = chars.length;
    const mask = new Array(n).fill(false);
    // 1) từ có dấu, đúng ranh giới chữ
    for (const w of BAD_VI) {
      const wa = [...w];
      for (let i = 0; i + wa.length <= n; i++) {
        let ok = true; for (let k = 0; k < wa.length; k++) if (low[i + k] !== wa[k]) { ok = false; break; }
        if (!ok) continue;
        if ((i > 0 && isLetter(low[i - 1])) || (i + wa.length < n && isLetter(low[i + wa.length]))) continue;
        for (let k = 0; k < wa.length; k++) mask[i + k] = true;
      }
    }
    // 2) từ viết tắt/không dấu: tách theo chữ-số, cho phép . * - _ chen giữa các chữ ("d.m", "v-c-l")
    const toks = []; let s = -1, comp = '';
    for (let i = 0; i <= n; i++) {
      const c = base[i] || '';
      const al = /[a-z0-9]/.test(c), sep = /[.*\-_]/.test(c) && s >= 0 && /[a-z0-9]/.test(base[i + 1] || '');
      if (al || sep) { if (s < 0) { s = i; comp = ''; } if (al) comp += c; }
      else if (s >= 0) { toks.push({ s, e: i, w: comp }); s = -1; }
    }
    for (const t of toks) if (BAD_ASCII.has(t.w)) for (let k = t.s; k < t.e; k++) mask[k] = true;
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1];
      if (BAD_PAIRS.some(([x, y]) => a.w === x && b.w === y) && chars.slice(a.e, b.s).every(c => /\s/.test(c))) {
        // chỉ coi là chửi khi viết không dấu hoặc đúng dấu tục ("địt mẹ", "đụ má"); "đi mẹ", "du ma" có dấu khác thì bỏ qua
        const raw = low.slice(a.s, b.e).join('');
        if (/^[a-z\s]+$/.test(raw) || /^(địt|đụ|con|cái|vãi)\s/.test(raw)) for (let k = a.s; k < b.e; k++) mask[k] = true;
      }
    }
    const bad = mask.some(Boolean);
    if (!bad) return { bad: false, text: chars.join('') };
    let out = ''; for (let i = 0; i < n; i++) out += mask[i] ? (i > 0 && mask[i - 1] ? '' : '***') : chars[i];
    return { bad: true, text: out };
  }
  if (typeof module === 'object' && module.exports) module.exports = { badFilter };
  else root.badFilter = badFilter;
})(typeof window !== 'undefined' ? window : globalThis);
