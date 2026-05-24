const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { marked } = require('marked');
const initSqlJs = require('sql.js').default;
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'blog.db');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const PASSWORD = process.env.BLOG_PASSWORD || '012345Zz';

const UPLOAD_DIR_REL = '/uploads';

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp|mp4|webm|pdf|doc|docx|xls|xlsx|zip|rar)$/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('不支持的文件类型'));
  }
});

let db;
let SQL;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function hashPw(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function isAuth(req) {
  return req.cookies && req.cookies.token === hashPw(PASSWORD);
}

function requireAuth(req, res, next) {
  if (isAuth(req)) return next();
  res.redirect('/login');
}

function getSetting(key, def) {
  const r = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
  return r.length && r[0].values.length ? r[0].values[0][0] : def;
}

function getSettings() {
  const r = db.exec('SELECT key, value FROM settings');
  const s = {};
  for (const row of r[0] ? r[0].values : []) s[row[0]] = row[1];
  return s;
}

async function initDb() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  const pcount = db.exec('SELECT COUNT(*) as c FROM posts');
  if (!pcount.length || !pcount[0].values.length || pcount[0].values[0][0] === 0) {
    db.run('INSERT INTO posts (title, content, date) VALUES (?, ?, ?)',
      ['欢迎来到我的博客',
       '## 你好！\n\n这是我的第一篇博客文章。\n\n### 关于我\n\n我是一名开发者，热爱编程和分享知识。',
       new Date().toISOString().slice(0, 10)]);
  }
  const defaults = {
    site_title: '我的博客',
    site_subtitle: '分享技术与生活',
    avatar: '',
    about: '一个简单的个人博客',
    widgets: 'about,recent',
    theme: 'default'
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
  saveDb();
}

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(UPLOAD_DIR_REL, express.static(UPLOAD_DIR));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const cookies = req.headers.cookie || '';
  req.cookies = {};
  for (const pair of cookies.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) req.cookies[k] = decodeURIComponent(v.join('='));
  }
  next();
});

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未选择文件' });
  res.json({ url: UPLOAD_DIR_REL + '/' + req.file.filename });
});

app.get('/login', (req, res) => {
  if (isAuth(req)) return res.redirect('/');
  res.render('login');
});

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.setHeader('Set-Cookie', `token=${hashPw(PASSWORD)}; Path=/; HttpOnly`);
    return res.redirect('/');
  }
  res.render('login', { error: '密码错误' });
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
  res.redirect('/');
});

app.get('/settings', requireAuth, (req, res) => {
  res.render('settings', { settings: getSettings() });
});

app.post('/settings', requireAuth, (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
  saveDb();
  res.redirect('/settings');
});

app.get('/', (req, res) => {
  const stmt = db.prepare('SELECT id, title, date, substr(content, 1, 200) as excerpt FROM posts ORDER BY id DESC');
  const posts = [];
  while (stmt.step()) { posts.push(stmt.getAsObject()); }
  stmt.free();
  const settings = getSettings();
  const widgets = (settings.widgets || '').split(',').filter(Boolean);
  res.render('index', { posts, settings, widgets, auth: isAuth(req) });
});

app.get('/post/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM posts WHERE id = ?');
  stmt.bind([parseInt(req.params.id)]);
  if (!stmt.step()) { stmt.free(); return res.status(404).send('文章未找到'); }
  const post = stmt.getAsObject();
  stmt.free();
  post.content = marked(post.content);
  const settings = getSettings();
  const widgets = (settings.widgets || '').split(',').filter(Boolean);
  res.render('post', { post, settings, widgets, auth: isAuth(req) });
});

app.get('/new', requireAuth, (req, res) => {
  res.render('new', { settings: getSettings(), auth: true });
});

app.post('/new', requireAuth, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.redirect('/new');
  db.run('INSERT INTO posts (title, content, date) VALUES (?, ?, ?)',
    [title, content, new Date().toISOString().slice(0, 10)]);
  saveDb();
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  res.redirect(`/post/${id}`);
});

app.get('/edit/:id', requireAuth, (req, res) => {
  const stmt = db.prepare('SELECT * FROM posts WHERE id = ?');
  stmt.bind([parseInt(req.params.id)]);
  if (!stmt.step()) { stmt.free(); return res.status(404).send('文章未找到'); }
  const post = stmt.getAsObject();
  stmt.free();
  res.render('edit', { post, settings: getSettings(), auth: true });
});

app.post('/edit/:id', requireAuth, (req, res) => {
  db.run('UPDATE posts SET title = ?, content = ? WHERE id = ?',
    [req.body.title, req.body.content, parseInt(req.params.id)]);
  saveDb();
  res.redirect(`/post/${req.params.id}`);
});

app.post('/delete/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM posts WHERE id = ?', [parseInt(req.params.id)]);
  saveDb();
  res.redirect('/');
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err) return res.status(400).json({ error: err.message });
  next();
});

(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`博客运行在 http://localhost:${PORT}`);
  });
})();
