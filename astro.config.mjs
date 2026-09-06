import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://retroguyvn.com',
  output: 'server',
  adapter: cloudflare({
    session: false,
    imageService: 'passthrough'
  }),
  trailingSlash: 'never'
});
