import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resetBuildOutput } from './build-output.ts';

// npm 10 runs linked-workspace prepare even with --ignore-scripts.
// Keep that install mode free of builds without suppressing explicit builds.
if (process.env.npm_lifecycle_event === 'prepare' && process.env.npm_config_ignore_scripts === 'true') {
  process.exit(0);
}

const { build } = await import('esbuild');
const require = createRequire(import.meta.url);
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
resetBuildOutput(process.cwd());
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync('dist/cjs', { recursive: true });
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/cjs/index.js', bundle: true, platform: 'node', target: 'node22', format: 'cjs' });
for (const name of readdirSync('dist/esm').filter(name => name.endsWith('.d.ts'))) {
  copyFileSync(`dist/esm/${name}`, `dist/cjs/${name}`);
}
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
