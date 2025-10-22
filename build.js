// A tiny static-site generator: reads posts/*.md and writes dist/index.html and dist/posts/*.html
// Usage: node build.js
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'posts');
const DIST_DIR = path.join(__dirname, 'dist');
const DIST_POSTS_DIR = path.join(DIST_DIR, 'posts');
const STYLE_PATH = 'styles.css';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseMarkdown(md) {
  // Very small markdown-like parser:
  // headings (#, ##, ###), paragraphs, links [text](url), bold **text**, italic *text*
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) { out.push(''); continue; } // preserve blank line
    // headings
    if (/^#{1,6}\s+/.test(line)) {
      const lvl = line.match(/^#{1,6}/)[0].length;
      const text = line.replace(/^#{1,6}\s+/, '');
      out.push(`<h${lvl}>${escapeHtml(replaceInline(text))}</h${lvl}>`);
      continue;
    }
    // lists (simple)
    if (/^[-*]\s+/.test(line)) {
      // accumulate list
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push('<li>' + escapeHtml(replaceInline(lines[i].trim().replace(/^[-*]\s+/, ''))) + '</li>');
        i++;
      }
      i--;
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    // paragraph
    out.push('<p>' + escapeHtml(replaceInline(line)) + '</p>');
  }
  return out.join('\n');
}

function replaceInline(text) {
  // links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = files.map(filename => {
    const filepath = path.join(POSTS_DIR, filename);
    const raw = fs.readFileSync(filepath, 'utf8');
    // extract front-matter-like fields if present (--- ... ---)
    let title = '';
    let date = '';
    let body = raw;
    if (/^---\s*\n([\s\S]*?)\n---\s*\n/.test(raw)) {
      const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)[1];
      body = raw.replace(/^---\s*\n([\s\S]*?)\n---\s*\n/, '');
      fm.split(/\r?\n/).forEach(line => {
        const kv = line.split(':').map(s => s.trim());
        if (kv[0] && kv[1]) {
          if (kv[0].toLowerCase() === 'title') title = kv[1];
          if (kv[0].toLowerCase() === 'date') date = kv[1];
        }
      });
    }
    // fallback: first '# ' heading as title
    if (!title) {
      const m = body.match(/^\s*#\s+(.+)$/m);
      if (m) title = m[1].trim();
    }
    const slug = slugify(path.basename(filename, '.md'));
    const html = parseMarkdown(body);
    const excerpt = body.split(/\r?\n/).find(l => l.trim().length > 0) || '';
    return { filename, slug, title: title || slug, date, html, excerpt: excerpt.slice(0,160) };
  });
  // sort by filename (or you can sort by date if you provide dates)
  posts.sort((a,b) => (b.date || b.filename).localeCompare(a.date || a.filename));
  return posts;
}

function renderPostPage(post) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(post.title)}</title>
  <link rel="stylesheet" href="../${STYLE_PATH}">
</head>
<body>
  <main class="container">
    <a class="back" href="../index.html">← back</a>
    <article class="post">
      <h1>${escapeHtml(post.title)}</h1>
      ${post.date ? `<time class="date">${escapeHtml(post.date)}</time>` : ''}
      <div class="content">
        ${post.html}
      </div>
    </article>
  </main>
</body>
</html>`;
}

function renderIndex(posts) {
  const items = posts.map(p => {
    return `<li class="post-list-item">
      <a href="posts/${p.slug}.html"><h2>${escapeHtml(p.title)}</h2></a>
      ${p.date ? `<time class="date">${escapeHtml(p.date)}</time>` : ''}
      <p class="excerpt">${escapeHtml(p.excerpt)}</p>
    </li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>My Blog</title>
  <link rel="stylesheet" href="${STYLE_PATH}">
</head>
<body>
  <main class="container">
    <header>
      <h1>My Blog</h1>
    </header>
    <ul class="post-list">
      ${items}
    </ul>
  </main>
</body>
</html>`;
}

function copyStyle() {
  const src = path.join(__dirname, 'styles.css');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST_DIR, 'styles.css'));
  } else {
    // minimal fallback
    fs.writeFileSync(path.join(DIST_DIR, 'styles.css'), 'body{font-family:Arial,Helvetica,sans-serif}');
  }
}

function build() {
  ensureDir(DIST_DIR);
  ensureDir(DIST_POSTS_DIR);
  const posts = readPosts();
  // write posts
  posts.forEach(p => {
    const outPath = path.join(DIST_POSTS_DIR, p.slug + '.html');
    fs.writeFileSync(outPath, renderPostPage(p), 'utf8');
  });
  // index
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), renderIndex(posts), 'utf8');
  copyStyle();
  console.log('Built', posts.length, 'posts ->', DIST_DIR);
}

build();