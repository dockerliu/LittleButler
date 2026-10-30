# 项目结构说明

```
003.小管家Cloudflare/
├── src/
│   ├── db/
│   │   └── schema.ts              # D1 数据库 Schema 定义（Drizzle ORM）
│   ├── layouts/
│   │   └── Base.astro             # 基础布局（Head/Meta/PWA/全局样式）
│   ├── lib/
│   │   ├── auth.ts                # 认证核心（PBKDF2、会话、频控）
│   │   ├── db.ts                  # DB 助手（从 runtime.env 动态获取 D1）
│   │   ├── date.ts                # 日期工具函数
│   │   ├── http.ts                # HTTP 响应助手
│   │   ├── money.ts               # 金额转换（分 ↔ 元）
│   │   ├── types.ts               # TypeScript 类型定义
│   │   └── env.d.ts               # Cloudflare 环境变量类型
│   ├── pages/
│   │   ├── api/                   # API 路由
│   │   │   ├── accounts/          # 账户管理
│   │   │   │   ├── index.ts       # GET/POST
│   │   │   │   └── [id]/index.ts  # PATCH/DELETE
│   │   │   ├── auth/              # 认证
│   │   │   │   ├── login.ts       # POST
│   │   │   │   ├── logout.ts      # POST
│   │   │   │   ├── register.ts    # POST
│   │   │   │   └── me.ts          # GET
│   │   │   ├── bootstrap.ts       # 首屏数据（GET）
│   │   │   ├── budgets/           # 预算
│   │   │   │   └── [month]/index.ts # GET/PUT/DELETE
│   │   │   ├── categories/        # 分类管理
│   │   │   │   ├── index.ts       # GET/POST
│   │   │   │   └── [id]/index.ts  # PATCH
│   │   │   ├── data/
│   │   │   │   └── clear.ts       # 清空数据（POST）
│   │   │   ├── export.ts          # CSV 导出（GET）
│   │   │   ├── photos/            # 图片管理
│   │   │   │   ├── index.ts       # POST（上传）
│   │   │   │   └── [id]/index.ts  # GET/DELETE
│   │   │   ├── recycle.ts         # 回收站（GET/POST）
│   │   │   ├── suppliers/         # 供应商管理
│   │   │   │   ├── ensure.ts      # 自动创建（POST）
│   │   │   │   ├── index.ts       # GET/POST
│   │   │   │   └── [id]/index.ts  # PATCH
│   │   │   ├── stats/             # 统计
│   │   │   │   └── [month]/index.ts # GET
│   │   │   ├── transactions/      # 账单管理
│   │   │   │   ├── index.ts       # GET/POST
│   │   │   │   ├── [id]/index.ts  # PATCH/DELETE
│   │   │   │   └── [id]/restore.ts # POST
│   │   │   └── indices.ts         # 索引列表（可选）
│   │   ├── index.astro            # 应用主入口（SSR 门）
│   │   └── login.astro            # 登录/注册页
│   ├── scripts/                   # 客户端脚本（打包后注入）
│   │   ├── app.ts                 # UI 层（四 Tab、弹层、记账面板）
│   │   ├── charts.ts              # 图表渲染（SVG/DOM）
│   │   ├── photos.ts              # 图片压缩与 Lightbox
│   │   └── store.ts               # API 客户端 + 状态管理
│   ├── styles/
│   │   └── global.css             # 全局样式（002/style.css 迁移）
│   └── static/                    # 静态资源（上传到 Cloudflare）
│       ├── icon.svg               # Favicon
│       ├── manifest.webmanifest   # PWA manifest
│       └── sw.js                  # Service Worker（只缓存静态资源）
├── migrations/                    # D1 数据库迁移文件
│   └── 0001_init.sql              # 初始化迁移
├── public/                        # 部署到 dist/
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js
├── .env.example                   # 环境变量示例
├── .gitignore                     # Git 忽略文件
├── astro.config.mjs               # Astro 配置
├── drizzle.config.ts              # Drizzle ORM 配置
├── package.json                   # 项目依赖
├── tsconfig.json                  # TypeScript 配置
├── wrangler.jsonc                 # Cloudflare Workers 配置
└── README.md                      # 操作文档
```

---

## 核心文件说明

### 服务端文件

#### `src/db/schema.ts`
- 定义所有 D1 表结构
- 使用 Drizzle ORM 定义
- 金额字段单位为「分」
- 所有表含 `created_at` 和 `updated_at`
- 软删除表含 `deleted_at` 字段

#### `src/lib/auth.ts`
- **PBKDF2-SHA256**: 密码哈希（100,000 次迭代）
- **会话管理**: KV 存储 session token（TTL：7天/12小时）
- **登录频控**: 连错 5 次锁 5 分钟（KV 存储）
- **安全**: HttpOnly/Secure/SameSite=Lax Cookie

#### `src/lib/http.ts`
- 统一响应格式: `{ok, data}` 或 `{ok, msg}`
- `handle()` 中间件统一错误处理
- `ok()`, `err()` 响应助手

#### `src/lib/money.ts`
- `parseAmountToCents()`: 元转分（整数）
- `centsToYuanText()`: 分转元（保留两位小数）

### 客户端文件

#### `src/scripts/store.ts`
- API 客户端封装（`fetch` 封装）
- 全局状态管理（`onChange` 事件）
- 数据加载（`bootstrap`, `loadBootstrap`）
- 与旧版 `store.js` 接口对齐

#### `src/scripts/app.ts`
- UI 层（移植自 002 `app.js`）
- 四 Tab 渲染：明细、统计、预算、我的
- 弹层系统：sheet、confirm、prompt
- 记账面板：分类/账户/供应商/图片/日期/备注
- 管理页面：分类/供应商/账户/回收站管理
- CSV 导出

#### `src/scripts/charts.ts`
- 分类占比条（SVG）
- 每日柱状图（SVG）
- 6 月折线图（SVG）
- 每日表格视图
- 无障碍支持：tooltip + 表格

#### `src/scripts/photos.ts`
- `compressImage()`: Canvas 压缩（最长边 1280px，≤200KB）
- `showLightbox()`: 图片灯箱查看

### 配置文件

#### `astro.config.mjs`
- `output: 'server'`（Cloudflare Pages 推荐）
- `adapter: cloudflare()`
- `serverExternalPackages: ['drizzle-orm']`

#### `wrangler.jsonc`
- **绑定配置**: D1, R2, KV
- **compatibility_date**: 2024-01-01
- **compatibility_flags**: [nodejs_compat]

#### `drizzle.config.ts`
- dialect: sqlite
- schema: `./src/db/schema.ts`
- migrations: `./migrations/`

---

## API 路由规范

### 路由结构

- `/api/{resource}` → `GET/POST`（列表/新增）
- `/api/{resource}/{id}` → `PATCH/DELETE`（更新/删除）
- `/api/{resource}/{id}/{action}` → POST（特定操作）

### 请求/响应格式

**请求头**:
- Content-Type: `application/json`（API）
- Content-Type: `multipart/form-data`（图片上传）
- Cookie: `xgj_session=<token>`（所有需要认证的 API）

**响应格式**:
```json
{
  "ok": true,
  "data": { ... }
}
```

**错误响应**:
```json
{
  "ok": false,
  "msg": "错误描述"
}
```

---

## 数据流程

### 记账流程

1. **客户端**: `openEditSheet()` → 填写表单 → `saveOne()`
2. **前端**: `persist()` → `addTransaction()`
3. **API**: `POST /api/transactions`
4. **服务端**:
   - `addTransaction()` → Drizzle 插入 `transactions` 表
   - 图片上传 → `R2` 存储 → 插入 `photos` 表
5. **回调**: `toast('已记录')` → 刷新当前视图

### 统计流程

1. **客户端**: Tab 切换 → `renderStats()`
2. **API**: `GET /api/stats/{month}`
3. **服务端**: `monthStats()` → GROUP BY 聚合 → 返回统计结果
4. **渲染**: `charts.ts` 绘制图表

### 预算流程

1. **客户端**: 预算 Tab → 查看使用进度
2. **API**: `GET /api/budgets/{month}`
3. **服务端**: `budgetState()` → 计算剩余天数、日均可用
4. **回调**: 80% / 100% 触发提醒（KV 存储）

---

## 安全机制

1. **密码哈希**: PBKDF2-SHA256（100,000 次迭代）
2. **会话管理**: 随机 64 位 token + KV TTL
3. **Cookie 设置**: HttpOnly、Secure、SameSite=Lax
4. **数据隔离**: 所有查询带 `user_id` 过滤
5. **图片权限**: R2 访问通过 R2 API + `user_id` 鉴权
6. **频控**: 登录失败 5 次锁 5 分钟（KV）

---

## PWA 支持

- **Service Worker**: 只缓存静态资源（`public/`）
- **Manifest**: `manifest.webmanifest`
- **安装**: 需要上下文安全上下文（http(s)）
- **离线**: 仅缓存静态资源，API 需网络

---

## 性能优化

1. **静态资源缓存**: SW 缓存 static/
2. **API 响应缓存**: KV 缓存统计结果（短期）
3. **图片压缩**: 上传前压缩（≤200KB）
4. **懒加载**: Tab 懒渲染
5. **D1 索引**: `user_id`, `date`, `deleted_at` 索引

---

## 部署注意事项

1. **绑定配置**: D1, R2, KV 必须正确绑定
2. **兼容性日期**: 设置 `2024-01-01` 或更新
3. **Node.js 兼容**: 启用 `nodejs_compat` flag
4. **图片上传**: 确保上传目录可写（Cloudflare Pages 不支持）
5. **会话存储**: KV 必须配置 TTL
