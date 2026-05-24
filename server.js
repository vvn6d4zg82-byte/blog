const express = require('express');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const initSqlJs = require('sql.js').default;

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'blog.db');

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
app.use(express.urlencoded({ extended: true }));

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
