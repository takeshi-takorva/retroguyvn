import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const assets = [
  {
    source: 'public/images/dr-portal/site-sprite.b64',
    target: 'public/images/dr-portal/site-sprite.webp',
  },
  {
    source: 'public/images/brand/retroguy-wordmark.b64',
    target: 'public/images/brand/retroguy-wordmark.webp',
  },
];

for (const asset of assets) {
  const encoded = (await readFile(asset.source, 'utf8')).replace(/\s+/g, '');
  await mkdir(dirname(asset.target), { recursive: true });
  await writeFile(asset.target, Buffer.from(encoded, 'base64'));
  console.log(`[assets] ${asset.target}`);
}
