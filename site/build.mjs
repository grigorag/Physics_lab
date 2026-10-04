// Bundles each page's ES modules into one classic script (bundle.js) so the
// site also works when index.html is opened by double-click (file://),
// where browsers refuse to load <script type="module">.
// Run after editing any .js file:  npm run build
import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SHELL = join(root, 'assets/js/core/shell.js');

const pages = [
  { html: 'index.html', entry: 'assets/js/home.js', out: 'assets/js/home.bundle.js' },
  { html: 'section.html', entry: 'assets/js/section.js', out: 'assets/js/section.bundle.js' },
];
for (const section of readdirSync(join(root, 'sims'))) {
  const dir = join(root, 'sims', section);
  if (!statSync(dir).isDirectory()) continue;
  for (const id of readdirSync(dir)) {
    const base = `sims/${section}/${id}`;
    if (existsSync(join(root, base, 'index.html')) && existsSync(join(root, base, 'main.js')))
      pages.push({ html: `${base}/index.html`, entry: `${base}/main.js`, out: `${base}/bundle.js` });
  }
}

const q = (p) => JSON.stringify(p.replaceAll('\\', '/'));
for (const p of pages) {
  // shell first, then the page script: the same order as the two module tags
  await build({
    stdin: {
      contents: `import ${q(SHELL)};\nimport ${q(join(root, p.entry))};`,
      resolveDir: root,
    },
    bundle: true, format: 'iife', target: 'es2020', minify: true,
    outfile: join(root, p.out), logLevel: 'warning',
  });

  const file = join(root, p.html);
  let html = readFileSync(file, 'utf8');
  const tag = `<script defer src="${posix.relative(posix.dirname(p.html), p.out)}"></script>`;
  html = html
    .replace(/[ \t]*<script type="module"[^>]*><\/script>\r?\n?/g, '')
    .replace(/[ \t]*<script defer src="[^"]*bundle\.js"><\/script>\r?\n?/g, '');
  html = html.replace('</head>', `  ${tag}\n</head>`);
  writeFileSync(file, html);
}
console.log(`Bundled ${pages.length} pages.`);
