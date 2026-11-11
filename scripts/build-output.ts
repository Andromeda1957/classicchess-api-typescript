import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function resetBuildOutput(projectRoot: string): void {
  projectRoot = resolve(projectRoot);
  const output = resolve(projectRoot, 'dist');
  if (realpathSync(projectRoot) !== projectRoot) throw new Error('SDK project must be canonical.');
  const info = lstatSync(output, { throwIfNoEntry: false });
  if (info && (!info.isDirectory() || info.isSymbolicLink())) {
    throw new Error('SDK dist must be a directory without symlinks.');
  }
  const repository = resolve(projectRoot, '../..');
  const helper = resolve(repository, 'tools/shared/clean_build_output.py');
  if (process.env.ANDROMEDA_TASK_CONTAINER === '1'
      && process.env.ANDROMEDA_REPOSITORY === repository && existsSync(helper)) {
    const result = spawnSync('python3', [helper, 'sdks/typescript'], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Managed SDK dist cleanup refused.');
  } else {
    // Standalone SDK exports carry no monorepo runtime helper.
    rmSync(output, { recursive: true, force: true });
  }
}
