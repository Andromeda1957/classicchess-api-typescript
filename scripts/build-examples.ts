// Compile the Electron example's TypeScript into the JavaScript Electron runs:
// CommonJS main, preload and bridge modules and the renderer's classic script.
// The JavaScript is committed so `npx electron main.cjs` needs no build step;
// `--check` fails when it differs from a fresh compile of the TypeScript.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const example = 'examples/electron';
const sources: Record<string, string> = {
  'bridge.cjs': 'bridge.cts', 'main.cjs': 'main.cts', 'preload.cjs': 'preload.cts', 'renderer.js': 'renderer.ts',
};
// main and preload compile as plain scripts and the renderer as a module with
// no import or export, so no output refers to `exports`: a sandboxed preload
// and a classic renderer script have none.
const configs = ['tsconfig.examples.json', 'tsconfig.examples-renderer.json'];

const output = mkdtempSync(join(tmpdir(), 'classicchess-electron-example-'));
const stale: string[] = [];
let failed = false;
try {
  for (const config of configs) {
    const result = spawnSync(process.execPath, [tsc, '-p', config, '--outDir', output], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) { failed = true; break; }
  }
  if (!failed) {
    const emitted = readdirSync(output).sort();
    if (emitted.join() !== Object.keys(sources).sort().join()) {
      throw new Error(`Unexpected Electron example output: ${emitted.join(', ')}`);
    }
    for (const [name, source] of Object.entries(sources)) {
      const compiled = `// Generated from ${source} by \`npm run build:examples\`; edit the TypeScript instead.\n`
        + readFileSync(join(output, name), 'utf8');
      const target = join(example, name);
      if (!check) writeFileSync(target, compiled);
      else if (!existsSync(target) || readFileSync(target, 'utf8') !== compiled) stale.push(target);
    }
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
if (stale.length) {
  process.stderr.write(`Electron example JavaScript differs from its TypeScript; run \`npm run build:examples\`: ${stale.join(', ')}\n`);
  process.exitCode = 1;
}
