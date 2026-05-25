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
  // Read local sqlite
  const initSqlJs = require('sql.js').default;
  const dbPath = path.join(__dirname, '..', 'data', 'blog.db');
  if (!fs.existsSync(dbPath)) {
    console.error('Local sqlite db not found at', dbPath);
    process.exit(1);
  }
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

  const posts = q('SELECT * FROM posts ORDER BY id');
  const settings = q('SELECT * FROM settings');
  const media = q('SELECT * FROM media');
  const blocks = q('SELECT * FROM homepage_blocks ORDER BY sort_order');

  console.log(`读取本地数据: ${posts.length} 篇帖子, ${settings.length} 条设置, ${media.length} 个媒体, ${blocks.length} 个报纸模块`);

  // Connect to Railway PG
  const pg = new Pool({ connectionString: DATABASE_URL });
  const client = await pg.connect();

  try {
    await client.query('BEGIN');

    // Sync posts (skip existing)
    for (const p of posts) {
      const exists = await client.query('SELECT id FROM posts WHERE id = $1', [p.id]);
      if (exists.rows.length) {
        console.log(`  跳过帖子 #${p.id} (已存在)`);
        continue;
      }
      await client.query(
        `INSERT INTO posts (id, title, post_type, content, date, updated_at, cover_image, wallpaper)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.id, p.title, p.post_type, p.content, p.date, p.updated_at || p.date, p.cover_image || '', p.wallpaper || '']
      );
      console.log(`  写入帖子 #${p.id}: ${p.title || '无标题'}`);
    }
    // Reset sequence
    const maxId = posts.reduce((m, p) => Math.max(m, p.id || 0), 0);
    if (maxId > 0) {
      await client.query(`SELECT setval('posts_id_seq', $1)`, [maxId]);
    }

    // Sync settings (upsert)
    for (const s of settings) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [s.key, s.value]
      );
    }
    console.log(`  同步 ${settings.length} 条设置`);

    // Sync media (skip existing)
    for (const m of media) {
      const exists = await client.query('SELECT id FROM media WHERE id = $1', [m.id]);
      if (exists.rows.length) continue;
      await client.query(
        `INSERT INTO media (id, post_id, url, type, width, height, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [m.id, m.post_id, m.url, m.type, m.width || 0, m.height || 0, m.created_at]
      );
    }
    const maxMediaId = media.reduce((m, mm) => Math.max(m, mm.id || 0), 0);
    if (maxMediaId > 0) {
      await client.query(`SELECT setval('media_id_seq', $1)`, [maxMediaId]);
    }
    console.log(`  同步 ${media.length} 个媒体`);

    // Sync homepage_blocks (skip existing)
    for (const b of blocks) {
      const exists = await client.query('SELECT id FROM homepage_blocks WHERE id = $1', [b.id]);
      if (exists.rows.length) {
        console.log(`  跳过报纸模块 #${b.id} (已存在)`);
        continue;
      }
      await client.query(
        `INSERT INTO homepage_blocks (id, type, data, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [b.id, b.type, b.data, b.sort_order || 0]
      );
    }
    const maxBlockId = blocks.reduce((m, b) => Math.max(m, b.id || 0), 0);
    if (maxBlockId > 0) {
      await client.query(`SELECT setval('homepage_blocks_id_seq', $1)`, [maxBlockId]);
    }
    console.log(`  同步 ${blocks.length} 个报纸模块`);

    await client.query('COMMIT');
    console.log('✅ 数据同步完成');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('同步失败:', e);
    process.exit(1);
  } finally {
    client.release();
    await pg.end();
    sqlite.close();
  }
}

main();