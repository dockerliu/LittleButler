// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // SSR 模式：页面壳由服务端渲染，交互逻辑在客户端 TS，后端走 API Routes
  output: 'server',
  adapter: cloudflare({
	  
    platformProxy: {
      // 本地 astro dev 时启用 miniflare，提供 wrangler.jsonc 声明的 D1/R2/KV 绑定
      enabled: false,
    },
  }),
});
