# 小管家 Cloudflare 云端版操作文档

## 项目概述

「小管家」个人记账应用 Cloudflare 云端化改造版本，数据存储在 Cloudflare D1 数据库，图片存储在 R2，会话和频控存储在 KV。基于 Astro 框架，使用 Cloudflare Pages 部署。

**主要特性：**
- 云端账户体系（注册/登录/7天免登录）
- 数据按 user_id 隔离
- 支持账单软删除与恢复
- 预算管理（80% / 100% 提醒）
- CSV 导出
- 图片附件（自动压缩 ≤200KB）

**与 V1.0.2（本地版）的区别：**
- 数据从 localStorage 改为 D1 数据库
- 本机账户锁改为云端账户体系
- 所有数据需登录后访问

---

## 目录

1. [环境要求](#环境要求)
2. [本地开发](#本地开发)
3. [数据库绑定配置](#数据库绑定配置)
4. [远程部署](#远程部署)
5. [测试验证](#测试验证)
6. [常见问题](#常见问题)

---

## 环境要求

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **Cloudflare 账号**（用于创建 D1/R2/KV 资源）

---

## 本地开发

### 1. 安装依赖

```bash
cd 003.小管家Cloudflare
npm install
```

### 2. 初始化数据库

```bash
# 创建本地 D1 数据库
npx wrangler d1 create xgj-db

# 应用初始迁移
npx wrangler d1 migrations apply xgj-db --local
```

**注意**：记录下输出的 `database_id`，后续需要配置到 `wrangler.jsonc`。

### 3. 配置本地绑定（可选）

在 `wrangler.jsonc` 中添加本地绑定配置：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "xgj-db",
      "database_id": "<从步骤2获取的database_id>"
    }
  ]
}
```

### 4. 启动开发服务器

```bash
npx wrangler pages dev src --compatibility-date=2024-01-01
```

访问 http://localhost:8788

### 5. 初始化测试数据（首次运行）

1. 打开浏览器访问 http://localhost:8788
2. 先注册一个账户
3. 登录后使用应用

---

## 数据库绑定配置

### 方式一：通过 Cloudflare Dashboard（推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages**
3. 选择项目 **小管家 Cloudflare**
4. 进入 **Settings** > **Bindings**
5. 添加以下绑定：

#### D1 Database
- **Variable name**: `DB`
- **D1 Database**: 创建新数据库或选择已有数据库

#### R2 Bucket
- **Variable name**: `MY_BUCKET`
- **R2 Bucket**: 创建新 Bucket（如 `xgj-photos`）

#### KV Namespace
- **Variable name**: `KV`
- **KV Namespace**: 创建新 Namespace（如 `xgj-kv`）

### 方式二：通过 Wrangler CLI

```bash
# 创建 D1 数据库
npx wrangler d1 create xgj-db
npx wrangler d1 migrations apply xgj-db

# 创建 R2 Bucket
npx wrangler r2 bucket create xgj-photos

# 创建 KV Namespace
npx wrangler kv namespace create xgj-kv
```

记录输出中的 `id`，更新 `wrangler.jsonc`：

```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "xgj-db",
    "database_id": "<D1数据库的id>"
  }],
  "r2_buckets": [{
    "binding": "MY_BUCKET",
    "bucket_name": "xgj-photos"
  }],
  "kv_namespaces": [{
    "binding": "KV",
    "id": "<KV Namespace的id>"
  }]
}
```

---

## 远程部署

### 1. 构建项目

```bash
npm run build
```

产物输出到 `dist/` 目录。

### 2. 部署到 Cloudflare Pages

#### 方式一：通过 Dashboard

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 选择 **Workers & Pages** > **Create application** > **Pages**
3. 连接 Git 仓库或上传 `dist/` 目录
4. 绑定之前创建的资源（D1/R2/KV）

#### 方式二：通过 Wrangler CLI

```bash
# 部署到生产环境
npx wrangler pages deploy dist --project-name=xgj-cloudflare

# 或部署到预览环境
npx wrangler pages deploy dist --project-name=xgj-cloudflare --branch=preview
```

### 3. 配置生产环境绑定

部署后，在生产环境设置中添加相同的环境变量和绑定：

1. 进入项目设置 > **Settings** > **Functions** > **Environment variables**
2. 或进入 **Settings** > **Bindings** 添加 D1/R2/KV 绑定

---

## 测试验证

### 1. 基础流程测试

1. **注册/登录**
   - 访问 /login 页面
   - 注册新账户
   - 登录测试

2. **记账流程**
   - 点击「记一笔」按钮
   - 填写金额、分类、账户等信息
   - 添加图片附件（≤5 张）
   - 保存后检查明细 Tab

3. **统计功能**
   - 切换到「统计」Tab
   - 查看分类占比、供应商排行、每日趋势
   - 切换月份和图表/表格视图

4. **预算管理**
   - 切换到「预算」Tab
   - 设置本月预算
   - 观察预算使用进度条

5. **回收站**
   - 记录一笔账单后删除
   - 在「我的」→「回收站」查看
   - 恢复或彻底删除

### 2. 数据口径验证（Node 冒烟脚本）

创建测试脚本 `test-verification.js`：

```javascript
// 测试数据存储格式（分）
const parseAmountToCents = (amountStr) => {
  const [dollars, cents = '00'] = amountStr.split('.');
  return parseInt(dollars) * 100 + parseInt(cents);
};

const centsToYuanText = (cents) => {
  const yuan = Math.floor(cents / 100);
  const fen = cents % 100;
  return `${yuan}.${fen.toString().padStart(2, '0')}`;
};

// 验证存储格式
const amountInCents = parseAmountToCents('123.45');
console.log('存储格式验证:', amountInCents); // 12345

// 验证展示格式
const displayYuan = centsToYuanText(amountInCents);
console.log('展示格式验证:', displayYuan); // 123.45
```

运行测试：
```bash
node test-verification.js
```

### 3. API 验证（使用 curl 或 Postman）

```bash
# 登录
curl -X POST https://your-project.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456","remember":true}'

# 获取账单列表
curl -X GET "https://your-project.pages.dev/api/transactions?month=2026-10" \
  -H "Cookie: xgj_session=<session_cookie>"

# 记一笔
curl -X POST https://your-project.pages.dev/api/transactions \
  -H "Content-Type: application/json" \
  -H "Cookie: xgj_session=<session_cookie>" \
  -d '{
    "type": "expense",
    "amount": 100,
    "categoryId": "xxx",
    "accountId": "yyy",
    "date": "2026-10-30",
    "note": "测试",
    "supplierId": "zzz"
  }'
```

### 4. PWA 验证

1. 使用 Chrome DevTools > Application
2. 检查是否安装了 Service Worker
3. 检查是否生成了 manifest.webmanifest

---

## 常见问题

### Q1: 本地开发时出现 "Invalid binding `DB`"

**A**: 确保在 `wrangler.jsonc` 中配置了正确的 `database_id`，或者使用 `wrangler pages dev` 时通过 `--local` 参数。

```bash
npx wrangler pages dev src --compatibility-date=2024-01-01 --local
```

### Q2: 登录后跳转 401

**A**: 检查 KV namespace 是否正确绑定，会话是否正常创建。

### Q3: 图片上传失败

**A**: 检查 R2 bucket 是否存在且可访问，bucket name 必须与绑定变量名 `MY_BUCKET` 匹配。

### Q4: 数据库迁移失败

**A**: 确保使用正确的数据库名称和 ID：
```bash
# 查看已创建的数据库
npx wrangler d1 list

# 应用迁移
npx wrangler d1 migrations apply xgj-db --local
```

### Q5: 部署后 API 请求 404

**A**:
1. 检查 `.env` 或 `wrangler.jsonc` 中的路径配置
2. 确保 `src/pages/api/` 下的文件命名正确（如 `login.ts` 而不是 `login.tsx`）
3. 重新构建部署：
```bash
npm run build
npx wrangler pages deploy dist --project-name=xgj-cloudflare
```

### Q6: TypeScript 错误

**A**: 运行类型检查：
```bash
npx astro check
```

常见错误及修复见项目 `CLAUDE.md`。

---

## 技术栈

- **框架**: Astro 5
- **适配器**: @astrojs/cloudflare
- **数据库**: D1 (Drizzle ORM)
- **对象存储**: R2
- **缓存**: KV
- **构建工具**: Vite
- **类型系统**: TypeScript (strict mode)
- **样式**: CSS (无框架)

---

## 版本历史

### V2.0.0 (2026-10-30)
- ✅ 迁移到 Cloudflare 云端化
- ✅ 实现多用户账户体系
- ✅ 数据库（D1）/ 图片存储（R2）/ 会话（KV）
- ✅ 基础 CRUD 功能
- ✅ 预算管理
- ✅ 回收站功能
- ✅ CSV 导出

---

## 联系方式

- **项目地址**: [003.小管家Cloudflare/](./)
- **本地版**: [002.小管家H5/](../002.小管家H5/)
- **PRD 文档**: [001.产品PRD/个人财务管理产品PRD.md](../001.产品PRD/个人财务管理产品PRD.md)

---

## License

MIT
