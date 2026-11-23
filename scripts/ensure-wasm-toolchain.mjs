import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

function available(command, args = ['--version']) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const cargoBin = path.join(homedir(), '.cargo', 'bin');
if (!process.env.PATH?.split(path.delimiter).includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`;
}

if (available('wasm-pack')) {
  process.exit(0);
}

if (process.platform !== 'linux') {
  console.error('wasm-pack is required. Install Rust, the wasm32-unknown-unknown target, and wasm-pack, then retry.');
  process.exit(1);
}

if (!available('rustup')) {
  console.log('Installing the minimal Rust toolchain for this Linux build...');
  run('sh', ['-c', "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal"]);
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`;
}

if (!available('rustup')) {
  console.error('Rustup installation did not provide the rustup command.');
  process.exit(1);
}

run('rustup', ['target', 'add', 'wasm32-unknown-unknown']);
if (!available('wasm-pack')) {
  console.log('Installing wasm-pack...');
  run('cargo', ['install', 'wasm-pack', '--locked']);
}
