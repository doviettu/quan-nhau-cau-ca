// nodejs-mobile trên điện thoại là Node 18, chưa hiểu cờ regex /v (Node 20+) mà got và @sindresorhus/is dùng.
// Đổi /v thành /u trong node_modules của gói APK (các mẫu này dùng cú pháp mà /u cũng hiểu như nhau).
// Chạy: node android/patch-node18.mjs <thư mục có node_modules>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'node_modules'))) { console.error('Cần thư mục có node_modules'); process.exit(1); }
const re = /(\/(?:[^/\n\\*]|\\.)(?:[^/\n\\]|\\.)*\/)([dgimsy]*)v([dgimsy]*)(?=\.(?:test|exec)\(|\s*[,;)])/g;
let n = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'test') walk(p); }
    else if (/\.(m?js|cjs)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8');
      const out = s.replace(re, (m, body, a, b) => { n++; return body + a + 'u' + b; });
      if (out !== s) fs.writeFileSync(p, out);
    }
  }
})(path.join(root, 'node_modules'));
console.log(`Đã đổi ${n} regex /v sang /u cho Node 18`);
if (n < 1) { console.error('Không thấy regex /v nào – kiểm tra lại phiên bản thư viện'); process.exit(1); }
