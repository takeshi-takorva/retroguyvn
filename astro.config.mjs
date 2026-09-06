import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://retroguyvn.com',
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  trailingSlash: 'never'
});
