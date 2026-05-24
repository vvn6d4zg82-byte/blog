const express = require('express');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const initSqlJs = require('sql.js').default;
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'blog.db');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

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
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDb() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL
  )`);
  const count = db.exec('SELECT COUNT(*) as c FROM posts');
  if (!count.length || !count[0].values.length || count[0].values[0][0] === 0) {
    db.run(`INSERT INTO posts (title, content, date) VALUES (?, ?, ?)`,
      ['欢迎来到我的博客',
       '## 你好！\n\n这是我的第一篇博客文章。\n\n### 关于我\n\n我是一名开发者，热爱编程和分享知识。\n\n### 技术栈\n\n- **Node.js** - 后端\n- **Express** - Web 框架\n- **Markdown** - 文章格式\n\n希望你能在这里找到有用的内容！',
       new Date().toISOString().slice(0, 10)]);
    saveDb();
  }
}

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.urlencoded({ extended: true }));

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未选择文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.get('/', (req, res) => {
  const stmt = db.prepare('SELECT id, title, date, substr(content, 1, 200) as excerpt FROM posts ORDER BY id DESC');
  const posts = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    posts.push({ id: row.id, title: row.title, date: row.date, excerpt: row.excerpt });
  }
  stmt.free();
  res.render('index', { posts });
});

app.get('/post/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM posts WHERE id = ?');
  stmt.bind([parseInt(req.params.id)]);
  if (!stmt.step()) { stmt.free(); return res.status(404).send('文章未找到'); }
  const post = stmt.getAsObject();
  stmt.free();
  post.content = marked(post.content);
  res.render('post', { post });
});

app.get('/new', (req, res) => {
  res.render('new');
});

app.post('/new', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.redirect('/new');
  db.run('INSERT INTO posts (title, content, date) VALUES (?, ?, ?)',
    [title, content, new Date().toISOString().slice(0, 10)]);
  saveDb();
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  res.redirect(`/post/${id}`);
});

app.get('/edit/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM posts WHERE id = ?');
  stmt.bind([parseInt(req.params.id)]);
  if (!stmt.step()) { stmt.free(); return res.status(404).send('文章未找到'); }
  const post = stmt.getAsObject();
  stmt.free();
  res.render('edit', { post });
});

app.post('/edit/:id', (req, res) => {
  const { title, content } = req.body;
  db.run('UPDATE posts SET title = ?, content = ? WHERE id = ?',
    [title, content, parseInt(req.params.id)]);
  saveDb();
  res.redirect(`/post/${req.params.id}`);
});

app.post('/delete/:id', (req, res) => {
  db.run('DELETE FROM posts WHERE id = ?', [parseInt(req.params.id)]);
  saveDb();
  res.redirect('/');
});

(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`博客运行在 http://localhost:${PORT}`);
  });
})();
