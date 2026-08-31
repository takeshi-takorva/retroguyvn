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

// Keep the global dot pattern behind all product imagery, logos and page content.
// This patch is applied before Astro builds so the generated static HTML has the
// correct stacking order even while the visual system remains a single-page file.
const homepagePath = 'src/pages/index.astro';
const layerMarker = '/* RG_BACKGROUND_LAYER_FIX */';
let homepage = await readFile(homepagePath, 'utf8');

if (!homepage.includes(layerMarker)) {
  homepage = homepage.replace(
    '</style>',
    `\n    ${layerMarker}\n    body{position:relative;isolation:isolate}\n    body:before{z-index:0!important}\n    main,.footer{position:relative;z-index:1}\n    .nav{z-index:40}\n  </style>`,
  );
  await writeFile(homepagePath, homepage, 'utf8');
  console.log('[layout] background dot pattern moved behind content');
}
