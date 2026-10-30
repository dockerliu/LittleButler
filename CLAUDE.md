# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

「小管家」——个人记账 H5（Web/PWA），纯原生 HTML/CSS/JS：**无框架、无构建步骤、无第三方依赖、无服务端**。所有数据存浏览器 localStorage，不上传。

- `001.产品PRD/个人财务管理产品PRD.md` — 需求唯一来源（SSOT）。功能按 P0/P1/P2 分级，每个 P0 功能带验收标准；版本规划见第八节，历史决策见第十节"评审决议"。
- `002.小管家H5/` — 应用本体，另有该目录下的 README.md（运行方式与功能清单）。

**迭代流程**：需求变更先改 PRD（文档版本 +1、修订记录加一行、对应章节与验收标准），评审决议记录在案，再动代码。产品版本（V1.0.x）与 PRD 文档版本（V1.x）分开计数。

## 运行与验证

```bash
cd 002.小管家H5
python -m http.server 8080     # 或 npx serve .
```

- 访问 http://localhost:8080 。Service Worker / PWA 安装只在 http(s) 下生效（sw.js 注册有协议守卫）；直接双击 index.html 功能也可用。
- **语法检查**：`node --check js/xxx.js`（无 linter 配置）。
- **测试**：无测试框架。既有验证方式是临时 Node 冒烟脚本，用完即删（不放仓库）。模式：stub 掉 `localStorage`/`sessionStorage`、设 `global.window = global` 后 `require` 对应 js 文件，断言 `window.XGJ` / `window.XGJAuth` 上的函数行为。canvas/Image 相关（图片压缩、图表渲染）无法在 Node 测，需浏览器人工验证。

## 架构

四个经典 script（defer，按序加载）通过全局命名空间协作，无模块系统：

| 文件 | 全局 | 职责 |
| --- | --- | --- |
| `js/store.js` | `window.XGJ` | 数据层：localStorage 读写、账单/分类/供应商/账户/预算 CRUD、统计计算、CSV 导出 |
| `js/charts.js` | `window.XGJCharts` | 纯 SVG/DOM 图表（分类占比条、每日柱状、6 月折线），含 tooltip/表格视图 |
| `js/auth.js` | `window.XGJAuth` | 本机账户锁：注册/登录/免登录/锁定 |
| `js/app.js` | — | UI 层：四个 Tab 渲染、弹层（记账/筛选/各类管理）、启动门 |

### 必须遵守的数据口径（改动前先读 PRD 第六、七节）

- **金额一律以「分」为整数存储**（`parseAmountToCents` / `centsToYuanText`），界面展示才转元。
- **账单软删除**（`deletedAt`），回收站保留 30 天（超期在 `load()` 时清理）；彻底删除（`purgeTransaction`）同时清图片。
- **统计口径唯一**：按账单 `date` 归月、剔除已删除（`monthSummary` 等）。所有统计函数必须走同一口径。
- **账户数据隔离**：登录后存储键带用户名命名空间——`xgj:data:v1:u:<username>`、`xgj:photos:v1:u:<username>`；由 `store.setUser()` 切换。V1.0 的匿名键 `xgj:data:v1` 是迁移源，`adoptLegacyData()` 仅在当前账本为全新空账时继承，勿破坏该逻辑。
- **图片与账单主体分开存储**：photos 按账单 id 索引（dataURL 数组，≤5 张），`app.js` 的 `compressImage()` 用 canvas 压缩（最长边 1280px，逐级降质至 ≤200KB）。

### 认证模型（V1.0.1）

单本机账户，定位是隐私锁而非云端账号（云同步在 V2.0）。密码 = 随机盐 + SHA-256 ×3000 迭代（webcrypto，非安全上下文退化为 FNV-1a）；连错 5 次锁 5 分钟；7 天免登录存 localStorage，否则存 sessionStorage。`app.js` 的 `boot()` 是启动门：无会话则只渲染锁屏，不初始化主应用。

### UI 约定

- DOM 一律用 `app.js` 的 `el()` 助手 + `textContent` 构建；**用户数据（备注、分类名、供应商名等）严禁进 `innerHTML`**。charts.js 里的模板字符串必须经 `esc()`。
- 弹层复用单一 `#sheet` + `#overlay`，确认框走 `confirmDialog()`，行内改名走 `promptSheet()`。
- 图表遵循 dataviz 规范：单系列统一 slot-1 蓝（`--accent: #2a78d6`），不做按值染色/彩虹条；每个图表有表格视图或可见数值作为无障碍兜底；tooltip 文案"值为主、标签为辅"。

## 环境注意

- Windows + Git Bash；路径含中文（`002.小管家H5`），Node/bash 均可直接使用，必要时用引号包裹。
- 非 git 仓库：无 commit/branch 流程，改动直接落盘。
