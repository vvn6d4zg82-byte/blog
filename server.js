const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

function readPosts() {
  if (!fs.existsSync(POSTS_FILE)) return [];
  const data = fs.readFileSync(POSTS_FILE, 'utf-8');
  return JSON.parse(data);
}

function writePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}

app.get('/', (req, res) => {
  const posts = readPosts();
  res.render('index', { posts });
});

app.get('/post/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).send('文章未找到');
  post.content = marked(post.content);
  res.render('post', { post });
});

app.get('/new', (req, res) => {
  res.render('new');
});

app.post('/new', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.redirect('/new');
  const posts = readPosts();
  const post = {
    id: posts.length ? Math.max(...posts.map(p => p.id)) + 1 : 1,
    title,
    content,
    date: new Date().toISOString().slice(0, 10),
  };
  posts.push(post);
  writePosts(posts);
  res.redirect(`/post/${post.id}`);
});

app.get('/edit/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).send('文章未找到');
  res.render('edit', { post });
});

app.post('/edit/:id', (req, res) => {
  const posts = readPosts();
  const idx = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).send('文章未找到');
  posts[idx].title = req.body.title;
  posts[idx].content = req.body.content;
  writePosts(posts);
  res.redirect(`/post/${posts[idx].id}`);
});

app.post('/delete/:id', (req, res) => {
  let posts = readPosts();
  posts = posts.filter(p => p.id !== parseInt(req.params.id));
  writePosts(posts);
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`博客运行在 http://localhost:${PORT}`);
});
