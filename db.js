const path = require('path');
const fs = require('fs');

let db;
let isPg = false;

function sqliteEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function initDb() {
  if (process.env.DATABASE_URL) {
    isPg = true;
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT,
        post_type TEXT DEFAULT 'article',
        content TEXT DEFAULT '[]',
        date TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        cover_image TEXT DEFAULT '',
        wallpaper TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS homepage_blocks (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        sort_order INTEGER DEFAULT 0
      );
    `);
    await seed(pool);
    return {
      query: async (text, params) => {
        if (params) return pool.query(text, params);
        return pool.query(text);
      },
      end: () => pool.end(),
      isPg: true
    };
  }

  const initSqlJs = require('sql.js').default;
  const DB_PATH = path.join(__dirname, 'data', 'blog.db');
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    post_type TEXT DEFAULT 'article',
    content TEXT DEFAULT '[]',
    date TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    cover_image TEXT DEFAULT '',
    wallpaper TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS homepage_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    data TEXT DEFAULT '{}',
    sort_order INTEGER DEFAULT 0
  )`);
  seed();
  saveDb();

  return {
    query: (text, params) => {
      const isSelect = text.trim().toUpperCase().startsWith('SELECT');
      if (isSelect && (!params || !params.length)) {
        // Simple SELECT with no params (already escaped for sqlite)
        let sql = text;
        // Replace PostgreSQL :: cast syntax
        sql = sql.replace(/::text/g, '');
        sql = sql.replace(/::integer/g, '');
        sql = sql.replace(/::timestamp/g, '');
        try {
          const r = db.exec(sql);
          const rows = r.length && r[0] ? r[0].values.map((vals, i) => {
            const cols = r[0].columns;
            const row = {};
            for (let j = 0; j < cols.length; j++) row[cols[j]] = vals[j];
            return row;
          }) : [];
          return { rows };
        } catch(e) {
          console.error('SQLite query error:', e.message, '\nSQL:', sql);
          throw e;
        }
      }
      // Parametrized query: convert $1,$2 to ? for sqlite
      let sql = text;
      sql = sql.replace(/::text/g, '').replace(/::integer/g, '').replace(/::timestamp/g, '');
      // Replace PostgreSQL datetime function
      sql = sql.replace(/datetime\('now'\)/g, "datetime('now','localtime')");
      // Convert RETURNING clause to SQLite compatible
      const hasReturning = sql.match(/RETURNING\s+(\w+)/i);
      sql = sql.replace(/RETURNING\s+\w+/i, '');
      // Replace $1, $2 with ? 
      if (params) {
        let idx = 0;
        sql = sql.replace(/\$(\d+)/g, () => '?');
      }
      try {
        if (isSelect) {
          const stmt = db.prepare(sql);
          if (params) stmt.bind(params);
          const rows = [];
          while (stmt.step()) { rows.push(stmt.getAsObject()); }
          stmt.free();
          return { rows };
        }
        db.run(sql, params);
        saveDb();
        // Handle RETURNING by getting last_insert_rowid
        if (hasReturning) {
          const r = db.exec('SELECT last_insert_rowid() as id');
          return { rows: r.length && r[0] ? r[0].values.map(v => ({ id: v[0] })) : [] };
        }
        return { rows: [] };
      } catch(e) {
        console.error('SQLite query error:', e.message, '\nSQL:', sql, '\nParams:', params);
        throw e;
      }
    },
    end: () => { saveDb(); db.close(); },
    isPg: false
  };
}

async function seed(poolOrNone) {
  const defaults = {
    site_title: 'ZHZAILL',
    site_subtitle: '不存在的你，与我',
    avatar: '',
    about: '',
    widgets: 'about,recent',
    theme: 'y2k',
    music: '',
    wallpaper_url: '/wallpaper.mp4',
    wallpaper_overlay: '0.6'
  };
  if (poolOrNone && poolOrNone.query) {
    for (const [k, v] of Object.entries(defaults)) {
      await poolOrNone.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [k, v]
      );
    }
  } else {
    for (const [k, v] of Object.entries(defaults)) {
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }
}

function saveDb() {
  if (!process.env.DATABASE_URL && db) {
    const data = db.export();
    fs.writeFileSync(path.join(__dirname, 'data', 'blog.db'), Buffer.from(data));
  }
}

module.exports = { initDb };
