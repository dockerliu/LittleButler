/// <reference types="@astrojs/cloudflare" />
/// <reference types="@cloudflare/workers-types" />

/** wrangler.jsonc 中声明的绑定 */
type Env = {
  DB: D1Database;
  xgj_kv: KVNamespace;
  SESSION: KVNamespace;
  xiaoguanjia_photos: R2Bucket;
};

declare global {
  namespace App {
    interface Locals {
      runtime: import('@astrojs/cloudflare').Runtime<Env>;
    }
  }
}

// 为 APIContext 添加 env 属性
//interface APIContext {
//  env: Env;
//}

export {};
