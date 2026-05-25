require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const PASSWORD = process.env.BLOG_PASSWORD || '012345Zz';

let db;

function hashPw(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function cookieMiddleware(req, res, next) {
  const cookies = req.headers.cookie || '';
  req.cookies = {};
  for (const pair of cookies.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) req.cookies[k] = decodeURIComponent(v.join('='));
  }
  next();
}

function isAuth(req) {
  return req.cookies && req.cookies.token === hashPw(PASSWORD);
}

function requireAuth(req, res, next) {
  if (isAuth(req)) return next();
  res.redirect('/login');
}

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieMiddleware);

app.get('/login', (req, res) => {
  if (isAuth(req)) return res.redirect('/admin');
  res.render('login', { site_title: 'ZHZAILL' });
});

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.setHeader('Set-Cookie', `token=${hashPw(PASSWORD)}; Path=/; HttpOnly`);
    return res.redirect('/admin');
  }
  res.render('login', { error: '密码错误', site_title: 'ZHZAILL' });
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
  res.redirect('/');
});

app.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    const excerptExpr = db.isPg
      ? "substr(content::text, 1, 300) as excerpt"
      : "substr(content, 1, 300) as excerpt";
    const postsResult = await db.query(
      `SELECT id, title, post_type, cover_image, date, ${excerptExpr} FROM posts ORDER BY id DESC`
    );
    const posts = (postsResult.rows || []).map(p => ({
      ...p,
      date: p.date ? (typeof p.date === 'string' ? p.date.slice(0,10) : new Date(p.date).toISOString().slice(0,10)) : ''
    }));
    const blocksResult = await db.query('SELECT * FROM homepage_blocks ORDER BY sort_order ASC');
    const blocks = (blocksResult.rows || []).map(b => ({
      ...b,
      data: typeof b.data === 'string' ? JSON.parse(b.data || '{}') : (b.data || {})
    }));
    res.render('index', {
      settings,
      posts,
      blocks,
      auth: isAuth(req),
      site_title: 'ZHZAILL'
    });
  } catch(e) {
    console.error('Index error:', e);
    res.status(500).send('服务器错误');
  }
});

app.get('/post/:id', async (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    const result = await db.query('SELECT * FROM posts WHERE id = $1', [pid]);
    if (!result.rows.length) return res.status(404).send('文章未找到');
    const post = result.rows[0];
    if (post.date && typeof post.date !== 'string') {
      post.date = new Date(post.date).toISOString();
    }
    let content = post.content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch (e) { content = []; }
    }
    const settings = await getSettings();
    res.render('post', { post, content, settings, auth: isAuth(req), site_title: 'ZHZAILL' });
  } catch(e) {
    console.error('Post error:', e);
    res.status(500).send('服务器错误');
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const settings = await getSettings();
    const posts = await db.query('SELECT id, title, post_type, date FROM posts ORDER BY id DESC');
    res.render('admin', { settings, posts: posts.rows, site_title: 'ZHZAILL' });
  } catch(e) {
    console.error('Admin error:', e);
    res.status(500).send('服务器错误');
  }
});

app.get('/new', requireAuth, async (req, res) => {
  const settings = await getSettings();
  res.render('new', { settings, site_title: 'ZHZAILL' });
});

app.post('/new', requireAuth, async (req, res) => {
  try {
    const { title, post_type, content } = req.body;
    const contentStr = JSON.stringify(content || []);
    const dateExpr = db.isPg ? "NOW()" : "datetime('now','localtime')";
    const result = await db.query(
      `INSERT INTO posts (title, post_type, content, date) VALUES ($1, $2, $3, ${dateExpr}) RETURNING id`,
      [title || '', post_type || 'article', contentStr]
    );
    const id = result.rows[0] ? result.rows[0].id : null;
    if (!id) {
      // sql.js fallback: get last id
      const r = await db.query('SELECT MAX(id) as id FROM posts');
      res.json({ ok: true, id: r.rows[0] ? r.rows[0].id : 0 });
    } else {
      res.json({ ok: true, id });
    }
  } catch(e) {
    console.error('New post error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/edit/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM posts WHERE id = $1', [parseInt(req.params.id)]);
    if (!result.rows.length) return res.status(404).send('文章未找到');
    const post = result.rows[0];
    const settings = await getSettings();
    res.render('edit', { post, settings, site_title: 'ZHZAILL' });
  } catch(e) {
    console.error('Edit error:', e);
    res.status(500).send('服务器错误');
  }
});

app.post('/edit/:id', requireAuth, async (req, res) => {
  try {
    const { title, post_type, content } = req.body;
    const contentStr = JSON.stringify(content || []);
    await db.query(
      'UPDATE posts SET title = $1, post_type = $2, content = $3 WHERE id = $4',
      [title || '', post_type || 'article', contentStr, parseInt(req.params.id)]
    );
    res.json({ ok: true });
  } catch(e) {
    console.error('Edit error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/delete/:id', requireAuth, async (req, res) => {
  await db.query('DELETE FROM posts WHERE id = $1', [parseInt(req.params.id)]);
  res.redirect('/admin');
});

app.get('/settings', requireAuth, async (req, res) => {
  const settings = await getSettings();
  res.render('settings', { settings, site_title: 'ZHZAILL' });
});

app.post('/settings', requireAuth, async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await db.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [k, v]
    );
  }
  res.redirect('/settings');
});

app.get('/api/settings', async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.get('/api/posts', async (req, res) => {
  const posts = await db.query('SELECT id, title, post_type, cover_image, date FROM posts ORDER BY id DESC');
  res.json(posts.rows);
});

// ===== HOMEPAGE BLOCKS API =====
app.get('/api/homepage-blocks', async (req, res) => {
  try {
    const blocks = await db.query('SELECT * FROM homepage_blocks ORDER BY sort_order ASC');
    const parsed = blocks.rows.map(b => ({
      ...b,
      data: typeof b.data === 'string' ? JSON.parse(b.data || '{}') : (b.data || {})
    }));
    res.json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/homepage-blocks', requireAuth, async (req, res) => {
  try {
    const { type, data } = req.body;
    const maxResult = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM homepage_blocks');
    const nextOrder = maxResult.rows[0] ? maxResult.rows[0].next : 0;
    const dataStr = JSON.stringify(data || {});
    const result = await db.query(
      'INSERT INTO homepage_blocks (type, data, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [type, dataStr, nextOrder]
    );
    const id = result.rows[0] ? result.rows[0].id : null;
    if (!id) {
      const r = await db.query('SELECT MAX(id) as id FROM homepage_blocks');
      return res.json({ ok: true, id: r.rows[0] ? r.rows[0].id : 0 });
    }
    res.json({ ok: true, id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/homepage-blocks/:id', requireAuth, async (req, res) => {
  try {
    const { type, data, sort_order } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;
    if (type !== undefined) { updates.push(`type = $${idx++}`); params.push(type); }
    if (data !== undefined) { updates.push(`data = $${idx++}`); params.push(JSON.stringify(data)); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sort_order); }
    if (!updates.length) return res.status(400).json({ error: 'no fields' });
    params.push(parseInt(req.params.id));
    await db.query(`UPDATE homepage_blocks SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/homepage-blocks/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM homepage_blocks WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/homepage-blocks/reorder', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    for (let i = 0; i < ids.length; i++) {
      await db.query('UPDATE homepage_blocks SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
    }
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp|mp4|webm|avi|mov|mp3|wav|ogg|flac)$/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('不支持的文件类型'));
  }
});

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未选择文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

async function getSettings() {
  const result = await db.query('SELECT key, value FROM settings');
  const s = {};
  for (const row of result.rows) s[row.key] = row.value;
  return s;
}

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

(async () => {
  try {
    db = await initDb();
    app.listen(PORT, () => {
      console.log(`ZHZAILL 博客运行在 http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('启动失败:', e);
  }
})();
