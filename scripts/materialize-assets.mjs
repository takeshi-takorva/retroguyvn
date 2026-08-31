import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const assets = [
  // Legacy sprite kept temporarily for old pages/rollback safety.
  {
    source: 'public/images/dr-portal/site-sprite.b64',
    target: 'public/images/dr-portal/site-sprite.webp',
  },
  {
    source: 'public/images/brand/retroguy-wordmark.b64',
    target: 'public/images/brand/retroguy-wordmark.webp',
  },

  // Direct HQ product imagery used by the V1.1 landing page.
  {
    source: 'public/images/dr-portal/direct-src/navy-angle.b64',
    target: 'public/images/dr-portal/products/navy-angle.webp',
  },
  {
    source: 'public/images/dr-portal/direct-src/orange-angle.b64',
    target: 'public/images/dr-portal/products/orange-angle.webp',
  },
  {
    source: 'public/images/dr-portal/direct-src/product-family.b64',
    target: 'public/images/dr-portal/products/product-family.webp',
  },
  {
    source: 'public/images/dr-portal/direct-src/hardware.b64',
    target: 'public/images/dr-portal/products/hardware.webp',
  },
  {
    source: 'public/images/dr-portal/direct-src/lifestyle-pocket.b64',
    target: 'public/images/dr-portal/products/lifestyle-pocket.webp',
  },
  {
    source: 'public/images/dr-portal/direct-src/lifestyle-hand.b64',
    target: 'public/images/dr-portal/products/lifestyle-hand.webp',
  },
];

for (const asset of assets) {
  const encoded = (await readFile(asset.source, 'utf8')).replace(/\s+/g, '');
  await mkdir(dirname(asset.target), { recursive: true });
  await writeFile(asset.target, Buffer.from(encoded, 'base64'));
  console.log(`[assets] ${asset.target}`);
}

// Keep the global dot pattern behind all product imagery, logos and page content.
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
