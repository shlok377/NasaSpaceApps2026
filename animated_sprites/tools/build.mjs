// Regenerates every sprite sheet and copies the PNGs to public/assets/sprites, where the game loads them from.
//   npm run sprites
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, '..', 'public', 'assets', 'sprites');
mkdirSync(out, { recursive: true });
for (const name of ['satellite', 'rover', 'crew']) {
  execFileSync('node', [join(here, `gen-${name}.mjs`)], { stdio: 'inherit' });
  copyFileSync(join(root, name, `${name}.png`), join(out, `${name}.png`));
}
console.log('copied sheets to public/assets/sprites');
