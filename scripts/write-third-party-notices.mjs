import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageNames = [
  '@jsquash/jpeg', '@jsquash/oxipng', '@wasm-zoo/qpdf', 'asn1js', 'cropperjs',
  'fflate', 'pdf-lib', 'pdfjs-dist', 'pica', 'pkijs',
];
const destination = path.join(root, 'public', 'third-party-licenses');
await mkdir(destination, { recursive: true });
const rows = [];

for (const packageName of packageNames) {
  const packageRoot = path.join(root, 'node_modules', ...packageName.split('/'));
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const slug = packageName.replaceAll('/', '-').replaceAll('@', '');
  const licenseLinks = [];
  const candidates = [];
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^(?:LICENSE|NOTICE|COPYING)/i.test(entry.name)) candidates.push([entry.name, path.join(packageRoot, entry.name)]);
  }
  for (const subdirectory of ['codec', 'LICENSES']) {
    const subpath = path.join(packageRoot, subdirectory);
    try {
      for (const entry of await readdir(subpath, { withFileTypes: true })) {
        if (entry.isFile() && (subdirectory === 'LICENSES' || /^(?:LICENSE|NOTICE|COPYING)/i.test(entry.name))) candidates.push([`${subdirectory}-${entry.name}`, path.join(subpath, entry.name)]);
      }
    } catch { /* This package has no extra codec license folder. */ }
  }
  for (const [filename, source] of candidates) {
    const outputName = `${slug}-${filename}`;
    await cp(source, path.join(destination, outputName));
    licenseLinks.push(`<a href="./third-party-licenses/${outputName}">${filename}</a>`);
  }
  const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  rows.push(`<tr><th scope="row">${packageName} ${metadata.version}</th><td>${metadata.license ?? 'See bundled notice'}</td><td>${licenseLinks.join('<br>') || 'License details are in the source repository.'}</td><td>${repository ? `<a href="${repository.replace(/^git\+/, '').replace(/\.git$/, '')}">Source</a>` : ''}</td></tr>`);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#D14836"><title>Third-party notices — Paperplane</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="topbar"><a class="brand" href="./index.html#top" aria-label="Paperplane home"><span class="brand-mark" aria-hidden="true">✈</span><span>paperplane<span class="brand-dot">.</span></span></a></header>
<main class="usage-page"><article class="usage-card"><p class="eyebrow">PAPERPLANE</p><h1>Third-party notices</h1><p>Paperplane uses the open-source packages below for local file processing. The included license files and source links identify each direct dependency. QPDF and its bundled components have additional notices in the linked files.</p><div class="license-table-wrap"><table><thead><tr><th scope="col">Package</th><th scope="col">License</th><th scope="col">License text</th><th scope="col">Source</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><a class="usage-back" href="./index.html">← Back to Paperplane</a></article></main></body></html>`;
await writeFile(path.join(root, 'public', 'third-party-notices.html'), html, 'utf8');
