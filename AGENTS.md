# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

---

# 业务模块：链上哨兵（波场 USDT 地址风险查询）

## 产品概述
输入一个波场 TRC20-USDT 地址，实时核验其风险并输出可解释的风险报告，帮助用户在转账前规避被冻结/涉黑牵连风险。

## 核心架构
```
src/
├── app/
│   ├── page.tsx                    # 首页（查询入口，深色安全终端风）
│   └── api/risk/route.ts           # GET /api/risk?address= 风险查询接口
├── components/
│   ├── risk-checker.tsx            # 输入框 + 分步扫描加载态 + 状态管理
│   ├── risk-report.tsx             # 风险报告（总览/检查项/画像/关联地址/免责）
│   └── score-ring.tsx              # 风险评分环形仪表（0-100 数字滚动）
└── lib/risk/
    ├── types.ts                    # 领域类型（RiskReport/CheckItem/LinkedRisk 等）
    ├── tron.ts                     # 常量、TronWeb 单例、地址合法性校验
    ├── sdn-data.ts                 # OFAC SDN 波场地址快照（78 个，自动生成勿手改）
    ├── blacklist.ts               # 黑名单索引与分类标签
    ├── tron-data.ts                # 链上数据层（冻结/余额/账户/转账/关联聚合）
    └── score.ts                    # 风险评分引擎（权重累加 + 等级判定）
scripts/sdn_tron.txt                # OFAC 波场地址源数据
```

## 数据源（均为真实调用，禁止 Mock）
- **TronGrid 公共节点** `https://api.trongrid.io`：账户信息、TRC20 转账记录（免费、无需 key，有限流）。
- **USDT 合约** `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`，通过 `tronweb` 调用：
  - `isBlackListed(address)` → Tether 官方实时冻结状态。
  - `balanceOf(address)` → USDT 余额（decimals=6）。
- **OFAC SDN 名单**：种子快照来自 `https://www.treasury.gov/ofac/downloads/sdn.csv` 中字段 `Digital Currency Address - TRX`，已链上校验合法且抽样确认被 Tether 冻结。生产环境应定期重新抓取同步。

## 风险评分规则（src/lib/risk/score.ts）
- 权重累加后截断 100：本人被冻结 +100、本人命中 OFAC +95、关联制裁地址 +60（每个额外对手 +12）、新账户 +20、高周转 +15、过账特征 +15、无 USDT 历史 +10。
- 等级阈值：`>=70` high，`>=30` medium，其余 low。
- 关联分析基于近期最多 200 笔 USDT 转账的一跳对手（免费 API 取样上限）。

## API
- `GET /api/risk?address=<T...>`：非法地址返回 400；链上异常返回 502；成功返回完整 `RiskReport`（`runtime=nodejs`，`force-dynamic`）。

## 关键注意事项
- 依赖 `tronweb`（非 shadcn 自带），地址 ABI 编码必须用 tronWeb，禁止手拼 hex。
- 前端动态时间（queriedAt）仅在接口返回后渲染，避免 hydration 问题。
- 必须显著展示免责声明：结果仅供参考、数据有滞后、不构成法律/合规结论、不承诺"永不冻结"。
- 测试：改评分逻辑后，用「币安热钱包（高周转）」「OFAC 制裁地址（高危）」「制裁地址的交易对手（关联牵连）」三类真实地址回归。

## 自建 / 生产部署（国外服务器）
- 运行环境：Node 24（最低 20.9+）、pnpm 9；无需数据库，唯一外部依赖是出网访问 `api.trongrid.io`。
- 标准构建/启动（非沙箱环境用这两个，不要用 coze 包装脚本）：
  - 构建：`pnpm install --frozen-lockfile && pnpm next:build`（脚本为 `next build --webpack`，Next 16 默认 Turbopack，本项目有 webpack 自定义，必须带 `--webpack`）。
  - 启动：`HOSTNAME=0.0.0.0 PORT=5000 pnpm next:start`（必须绑 `0.0.0.0` 外网才可达）。
- 环境变量：
  - `TRONGRID_API_KEY`（可选）：在 `src/lib/risk/tron.ts` 统一读取，TronWeb 与原生 fetch 都带 `TRON-PRO-API-KEY` 头；不配则走免费公共节点（有限流）。
  - `SDN_SOURCE_URL`（可选）：同步脚本的数据源覆盖。
- 容器化：`Dockerfile`（多阶段，node:24-bookworm-slim，非 root，含 healthcheck）+ `docker-compose.yml`（仅绑定 `127.0.0.1:5000`，由 Nginx 转发）。构建：`docker compose build`，运行：`docker compose up -d`。
- 反向代理：`deploy/nginx/chain-sentinel.conf`，配合 `certbot --nginx` 上 HTTPS；`proxy_read_timeout` 已放大到 40s（查询串行调用多个外部接口）。

## OFAC 名单运维
- 同步脚本：`scripts/sync-sdn.ts`，命令 `pnpm sync:sdn`（用 tsx 运行）。
- 行为：下载官方 SDN CSV → 正则提取 `Digital Currency Address - TRX` 地址 → tronweb 校验合法性 → 去重排序 → 重写 `src/lib/risk/sdn-data.ts` 与 `scripts/sdn_tron.txt`；提取为 0 时中止不覆盖；数量较上次波动 >50% 打印告警。
- 服务器定时更新（cron，每天一次）：
  `0 4 * * * cd /opt/sentinel && pnpm sync:sdn >> /var/log/sdn-sync.log 2>&1 && docker compose restart sentinel`
- `sdn-data.ts` 为自动生成文件，禁止手工编辑。

