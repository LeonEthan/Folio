import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'source-manifest.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, SINGLEFILE: '1' } });
for (const [file, expected] of Object.entries(manifest.files)) {
  if (hash(readFileSync(join(root, file))) !== expected) throw Error(`Source pin changed: ${file}`);
}
// Windows TEMP may use an 8.3 alias; Vite module IDs must use one canonical path.
const temporary = realpathSync.native(mkdtempSync(join(tmpdir(), 'folio-bento-')));
const tree = join(temporary, 'bento');
let registered = false;
try {
  run(
    'git',
    ['worktree', 'add', '--detach', '--no-checkout', tree, manifest.bentoCommit],
    join(root, 'bento')
  );
  registered = true;
  run('git', ['sparse-checkout', 'set', 'slides', 'kernel', 'scripts'], tree);
  run('git', ['checkout'], tree);
  for (const patch of manifest.patches)
    run('git', ['apply', '--whitespace=error', join(root, 'patches', patch)], tree);
  const destination = join(tree, 'slides/src/a1a2/packages');
  cpSync(join(root, 'vendor/packages'), destination, { recursive: true });
  for (const file of Object.keys(manifest.files).filter(
    (f) => f.startsWith('vendor/packages/') && f.endsWith('.ts')
  )) {
    const relative = file.slice('vendor/packages/'.length);
    const target = join(destination, relative);
    const up = '../'.repeat(relative.split('/').length - 1);
    const source = readFileSync(target, 'utf8')
      .replaceAll('from "contracts"', `from "${up}contracts/src/index.ts"`)
      .replaceAll('from "kernel"', `from "${up}kernel/src/kernel.ts"`);
    writeFileSync(target, source);
  }
  const slides = join(tree, 'slides');
  // Use the checked-in npm lockfile; installation may fill an empty CI cache.
  if (process.platform === 'win32')
    run('cmd.exe', ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'], slides);
  else run('npm', ['ci', '--no-audit', '--no-fund'], slides);
  run(process.execPath, [join(slides, 'node_modules/typescript/bin/tsc'), '-b'], slides);
  run(
    process.execPath,
    [join(slides, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-single'],
    slides
  );
  const output = resolve(root, '../../apps/electron/resources/design');
  mkdirSync(output, { recursive: true });
  const shell = readFileSync(join(slides, 'dist-single/index.html'));
  writeFileSync(join(output, 'editor.html'), shell);
  cpSync(join(root, 'sample.json'), join(output, 'sample.json'));
  cpSync(join(root, 'bento/LICENSE'), join(output, 'BENTO-LICENSE'));
  cpSync(join(root, 'SPACE-MONO-LICENSE'), join(output, 'SPACE-MONO-LICENSE'));
  cpSync(join(root, 'FONTAWESOME-LICENSE'), join(output, 'FONTAWESOME-LICENSE'));
  writeFileSync(
    join(output, 'build.json'),
    JSON.stringify(
      {
        source: manifest.commit,
        bento: manifest.bentoCommit,
        shellSha256: hash(shell),
        sampleSha256: hash(readFileSync(join(root, 'sample.json'))),
        node: process.version,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Bento resources built: ${output}`);
} finally {
  try {
    if (registered) run('git', ['worktree', 'remove', '--force', tree], join(root, 'bento'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
