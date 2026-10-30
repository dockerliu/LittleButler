/// <reference types="@astrojs/cloudflare" />
/// <reference types="@cloudflare/workers-types" />

/** wrangler.jsonc 中声明的绑定 */
type Env = {
  DB: D1Database;
  MY_BUCKET: R2Bucket;
  KV: KVNamespace;
};

declare global {
  namespace App {
    interface Locals {
      runtime: import('@astrojs/cloudflare').Runtime<Env>;
    }
  }
}

export {};
