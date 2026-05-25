require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Run: railway connect');
  process.exit(1);
}

async function main() {
  // Connect to Railway PG
  const pg = new Pool({ connectionString: DATABASE_URL });
  const client = await pg.connect();

  let posts, settings, media, blocks;

  try {
    posts = (await client.query('SELECT * FROM posts ORDER BY id')).rows;
    settings = (await client.query('SELECT * FROM settings')).rows;
    media = (await client.query('SELECT * FROM media ORDER BY id')).rows;
    blocks = (await client.query('SELECT * FROM homepage_blocks ORDER BY sort_order')).rows;
  } catch(e) {
    console.error('读取远程数据失败:', e.message);
    console.log('（可能是空数据库，继续）');
    posts = []; settings = []; media = []; blocks = [];
  } finally {
    client.release();
    await pg.end();
  }

  console.log(`读取远程数据: ${posts.length} 篇帖子, ${settings.length} 条设置, ${media.length} 个媒体, ${blocks.length} 个报纸模块`);

  // Write to local sqlite
  const initSqlJs = require('sql.js').default;
  const dbDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'blog.db');
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();

  sqlite.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, post_type TEXT DEFAULT 'article', content TEXT DEFAULT '[]',
    date TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    cover_image TEXT DEFAULT '', wallpaper TEXT DEFAULT ''
  )`);
  sqlite.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  sqlite.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER, url TEXT NOT NULL, type TEXT NOT NULL,
    width INTEGER DEFAULT 0, height INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  sqlite.run(`CREATE TABLE IF NOT EXISTS homepage_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, data TEXT DEFAULT '{}', sort_order INTEGER DEFAULT 0
  )`);

  for (const p of posts) {
    sqlite.run(
      `INSERT OR REPLACE INTO posts (id, title, post_type, content, date, updated_at, cover_image, wallpaper)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.title, p.post_type, p.content,
       p.date ? new Date(p.date).toISOString().replace('T', ' ').slice(0, 19) : null,
       p.updated_at ? new Date(p.updated_at).toISOString().replace('T', ' ').slice(0, 19) : null,
       p.cover_image || '', p.wallpaper || '']
    );
  }
  for (const s of settings) {
    sqlite.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [s.key, s.value]);
  }
  for (const m of media) {
    sqlite.run(
      `INSERT OR REPLACE INTO media (id, post_id, url, type, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.post_id, m.url, m.type, m.width || 0, m.height || 0, m.created_at]
    );
  }
  for (const b of blocks) {
    sqlite.run(
      `INSERT OR REPLACE INTO homepage_blocks (id, type, data, sort_order)
       VALUES (?, ?, ?, ?)`,
      [b.id, b.type, b.data, b.sort_order || 0]
    );
  }

  const data = sqlite.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  sqlite.close();

  console.log(`✅ 远程数据已写入本地: ${dbPath}`);
  console.log(`  ${posts.length} 篇帖子, ${settings.length} 条设置, ${media.length} 个媒体, ${blocks.length} 个报纸模块`);
}

main();