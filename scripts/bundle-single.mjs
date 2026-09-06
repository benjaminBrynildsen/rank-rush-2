/**
 * Fold `npm run build` down to one self-contained HTML file, so the game can be
 * opened straight off disk or pasted anywhere that hosts a single page.
 *
 *   npm run build && node scripts/bundle-single.mjs
 *   -> dist/rank-rush.html
 *
 * Only the Google Fonts stylesheet stays external; everything else is inlined.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dist = 'dist';
let html = await readFile(join(dist, 'index.html'), 'utf8');

const assets = await readdir(join(dist, 'assets'));

for (const name of assets.filter((f) => f.endsWith('.css'))) {
  const css = await readFile(join(dist, 'assets', name), 'utf8');
  html = html.replace(
    new RegExp(`\\s*<link[^>]+href="[^"]*${name}"[^>]*>`),
    `\n    <style>${css}</style>`,
  );
}

for (const name of assets.filter((f) => f.endsWith('.js'))) {
  const js = await readFile(join(dist, 'assets', name), 'utf8');
  html = html.replace(
    new RegExp(`<script[^>]+src="[^"]*${name}"[^>]*></script>`),
    // The bundle can contain "</script>" inside a string literal; split it so
    // the parser does not end the block early.
    `<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>`,
  );
}

const leftover = html.match(/(src|href)="[^"]*\/assets\/[^"]*"/);
if (leftover) throw new Error(`an asset was not inlined: ${leftover[0]}`);

const out = join(dist, 'rank-rush.html');
await writeFile(out, html);
console.log(`${out}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`);
