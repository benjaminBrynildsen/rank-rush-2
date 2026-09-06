/**
 * Strip the standalone bundle down to what the Artifact host wants: it supplies
 * the <!doctype>, <html>, <head>, <body> skeleton, the charset and viewport, and
 * the favicon, so those come out and everything else stays exactly as built.
 *
 *   npm run build:single && node scripts/artifact-fragment.mjs out.html
 */
import { readFile, writeFile } from 'node:fs/promises';

const out = process.argv[2];
if (!out) throw new Error('usage: artifact-fragment.mjs <output.html>');

let html = await readFile('dist/rank-rush.html', 'utf8');

const strip = [
  /<!doctype html>\s*/i,
  /<\/?html[^>]*>\s*/gi,
  /<\/?head>\s*/gi,
  /<\/?body>\s*/gi,
  /<meta charset="utf-8"[^>]*>\s*/i,
  /<meta name="viewport"[^>]*>\s*/i,
  // The href is an SVG data URI full of ">" and "/>", so match the quoted
  // attribute rather than scanning for the tag's closing bracket.
  /<link\s+rel="icon"\s+href='[^']*'\s*\/?>\s*/i,
];
for (const pattern of strip) html = html.replace(pattern, '');
html = html.trim() + '\n';

// Nothing from the skeleton may survive, and no orphaned SVG may be left behind
// by a half-matched favicon tag.
const orphan = html.match(/<\/?(?:html|head|body)\b[^>]*>|<(?:svg|rect|text|path)\b|<link\s+rel="icon"/i);
if (orphan) throw new Error(`fragment still contains skeleton markup: ${orphan[0]}`);

await writeFile(out, html);
console.log(`${out}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`);
