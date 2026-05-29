const path = require('path');
const fs = require('fs');
const http = require('http');

const RAILWAY_URL = process.argv[2] || 'https://respectful-clarity-production-008b.up.railway.app';

async function main() {
  const initSqlJs = require('sql.js').default;
  const dbPath = path.join(__dirname, '..', 'data', 'blog.db');
  if (!fs.existsSync(dbPath)) { console.error('DB not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(fs.readFileSync(dbPath));

  function q(sql) {
    const r = sqlite.exec(sql);
    return r.length && r[0] ? r[0].values.map(vals => {
      const row = {};
      r[0].columns.forEach((c, i) => { row[c] = vals[i]; });
      return row;
    }) : [];
  }

  const body = JSON.stringify({
    posts: q('SELECT * FROM posts ORDER BY id'),
    settings: q('SELECT * FROM settings'),
    media: q('SELECT * FROM media'),
    blocks: q('SELECT * FROM homepage_blocks ORDER BY sort_order')
  });

  const url = new URL(RAILWAY_URL + '/api/sync');
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  if (url.protocol === 'https:') {
    const https = require('https');
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const result = JSON.parse(data);
        if (result.ok) console.log('✅ 同步成功');
        else console.error('❌ 同步失败:', result.error);
      });
    });
    req.on('error', e => console.error('❌ 请求失败:', e.message));
    req.write(body);
    req.end();
  }
}

main();
