import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoBin = path.join(homedir(), '.cargo', 'bin');
if (!process.env.PATH?.split(path.delimiter).includes(cargoBin)) process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`;
const packageNames = [
  'cropperjs',
];
const destination = path.join(root, 'public', 'third-party-licenses');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const rows = [];

async function addPackageNotice({ packageName, version, packageRoot, license, repository }) {
  const slug = `${packageName.replaceAll('/', '-').replaceAll('@', '')}-${version}`;
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
  let repositoryUrl = repository?.replace(/^git\+/, '').replace(/\.git$/, '');
  if (repositoryUrl && !/^https?:\/\//i.test(repositoryUrl)) repositoryUrl = `https://github.com/${repositoryUrl.replace(/^\/+/, '')}`;
  const packageSource = repositoryUrl ? `<a href="${repositoryUrl}">Package source</a>` : '';
  rows.push(`<tr><th scope="row">${packageName} ${version}</th><td>${license ?? 'See bundled notice'}</td><td>${licenseLinks.join('<br>') || 'License details are in the source repository.'}</td><td>${packageSource}</td></tr>`);
}

for (const packageName of packageNames) {
  const packageRoot = path.join(root, 'node_modules', ...packageName.split('/'));
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  await addPackageNotice({ packageName, version: metadata.version, packageRoot, license: metadata.license, repository });
}

const cargoResult = spawnSync('cargo', ['metadata', '--format-version=1', '--locked', '--offline', '--filter-platform', 'wasm32-unknown-unknown', '--manifest-path', path.join(root, 'rust', 'core', 'Cargo.toml')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (cargoResult.status !== 0) throw new Error(cargoResult.stderr || cargoResult.error?.message || 'Could not read Rust dependency metadata.');
const cargoMetadata = JSON.parse(cargoResult.stdout);
const packagesById = new Map(cargoMetadata.packages.map((item) => [item.id, item]));
const nodesById = new Map(cargoMetadata.resolve.nodes.map((item) => [item.id, item]));
const corePackage = cargoMetadata.packages.find((item) => item.name === 'projectpdf-core');
const rustDependencies = new Set();
const visit = (id) => {
  if (rustDependencies.has(id) || id === corePackage?.id) return;
  rustDependencies.add(id);
  for (const dependency of nodesById.get(id)?.deps ?? []) visit(dependency.pkg);
};
if (!corePackage) throw new Error('The projectpdf-core Rust package was not found in cargo metadata.');
for (const dependency of nodesById.get(corePackage.id)?.deps ?? []) visit(dependency.pkg);
for (const id of rustDependencies) {
  const metadata = packagesById.get(id);
  // Include local path overrides (currently tsp-ltv) alongside registry crates.
  if (!metadata || (metadata.source && !metadata.source.startsWith('registry+'))) continue;
  await addPackageNotice({
    packageName: metadata.name,
    version: metadata.version,
    packageRoot: path.dirname(metadata.manifest_path),
    license: metadata.license,
    repository: metadata.repository,
  });
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#D14836"><title>Third-party notices — Paperplane</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="topbar"><a class="brand" href="./index.html#top" aria-label="Paperplane home"><span class="brand-mark" aria-hidden="true">✈</span><span>paperplane<span class="brand-dot">.</span></span></a></header>
<main class="usage-page"><article class="usage-card"><p class="eyebrow">PAPERPLANE</p><h1>Third-party notices</h1><p>Paperplane uses the open-source browser package below for crop selection. It also uses the Rust and WebAssembly dependencies listed in <code>rust/core/Cargo.lock</code>. License files included in the build are copied from the locked packages.</p><div class="license-table-wrap"><table><thead><tr><th scope="col">Package</th><th scope="col">License</th><th scope="col">License text</th><th scope="col">Source</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><a class="usage-back" href="./index.html">← Back to Paperplane</a></article></main></body></html>`;
await writeFile(path.join(root, 'public', 'third-party-notices.html'), html, 'utf8');
