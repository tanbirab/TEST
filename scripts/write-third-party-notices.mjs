import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageNames = [
  '@jsquash/jpeg', '@jsquash/oxipng', '@wasm-zoo/ghostscript', 'asn1js', 'cropperjs',
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
  for (const subdirectory of ['codec', 'LICENSES', 'THIRD-PARTY-LICENSES']) {
    const subpath = path.join(packageRoot, subdirectory);
    try {
      const collect = async (directory, prefix) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const itemPath = path.join(directory, entry.name);
          const itemName = path.posix.join(prefix, entry.name);
          if (entry.isDirectory()) await collect(itemPath, itemName);
          else if (subdirectory === 'THIRD-PARTY-LICENSES' || subdirectory === 'LICENSES' || /^(?:LICENSE|NOTICE|COPYING)/i.test(entry.name)) candidates.push([`${subdirectory}-${itemName.replaceAll('\\', '-')}`, itemPath]);
        }
      };
      await collect(subpath, '');
    } catch { /* This package has no extra codec license folder. */ }
  }
  for (const [filename, source] of candidates) {
    const outputName = `${slug}-${filename}`;
    await cp(source, path.join(destination, outputName));
    licenseLinks.push(`<a href="./third-party-licenses/${outputName}">${filename}</a>`);
  }
  const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  let repositoryUrl = repository?.replace(/^git\+/, '').replace(/\.git$/, '');
  if (repositoryUrl && !/^https?:\/\//i.test(repositoryUrl)) repositoryUrl = `https://github.com/${repositoryUrl.replace(/^\/+/, '')}`;
  const packageSource = repositoryUrl ? `<a href="${repositoryUrl}">Package source</a>` : '';
  const upstreamSource = packageName === '@wasm-zoo/ghostscript' ? '<br><a href="https://github.com/ArtifexSoftware/ghostpdl">Upstream GhostPDL source</a>' : '';
  rows.push(`<tr><th scope="row">${packageName} ${metadata.version}</th><td>${metadata.license ?? 'See bundled notice'}</td><td>${licenseLinks.join('<br>') || 'License details are in the source repository.'}</td><td>${packageSource}${upstreamSource}</td></tr>`);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#D14836"><title>Third-party notices — Paperplane</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="topbar"><a class="brand" href="./index.html#top" aria-label="Paperplane home"><span class="brand-mark" aria-hidden="true">✈</span><span>paperplane<span class="brand-dot">.</span></span></a></header>
<main class="usage-page"><article class="usage-card"><p class="eyebrow">PAPERPLANE</p><h1>Third-party notices</h1><p>Paperplane uses the open-source packages below for local file processing. The included license files and source links identify each direct dependency. The separate Ghostscript WebAssembly component is licensed under AGPL-3.0-or-later and includes additional upstream notices and third-party license texts.</p><p>The Ghostscript component is distributed to browsers as part of this site. See the linked source and license texts for its terms and source code.</p><div class="license-table-wrap"><table><thead><tr><th scope="col">Package</th><th scope="col">License</th><th scope="col">License text</th><th scope="col">Source</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><a class="usage-back" href="./index.html">← Back to Paperplane</a></article></main></body></html>`;
await writeFile(path.join(root, 'public', 'third-party-notices.html'), html, 'utf8');
