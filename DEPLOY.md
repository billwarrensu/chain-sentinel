# 链上哨兵 · 海外服务器部署指南

把「波场 USDT 地址风险查询工具」部署到你自己的海外服务器，并通过域名 + HTTPS 对外提供服务。

- 运行形态：Next.js 16 生产服务（`next start`），无状态、**无数据库**
- 唯一外部依赖：服务器出网访问 `https://api.trongrid.io`
- 提供两种部署方式：**Docker（推荐）** 与 **裸机 pm2**

---

## 1. 服务器规格与准备

| 项 | 要求 |
|---|---|
| 操作系统 | Linux x64，推荐 Ubuntu 22.04 / 24.04 LTS 或 Debian 12 |
| 配置 | 最低 1 vCPU / 1G 内存；**构建时建议 2G**（1G 机器先加 swap，见附录 A） |
| 磁盘 | 20G 足够（无数据库，几乎不占盘） |
| 地区 | 选能顺畅访问 TronGrid 的节点：美西 / 新加坡 / 日本均可 |
| 权限 | 一个可 `sudo` 的普通用户，不要长期用 root 跑业务进程 |
| 网络 | 可访问 `api.trongrid.io`、`tronscan.org`；开放 22 / 80 / 443 |

**上线前你需要准备好：**

1. 一台海外 VPS（Vultr / DigitalOcean / Lightsail / 搬瓦工等均可）。
2. 一个域名，并把 **A 记录解析到服务器 IP**（HTTPS 必需）。
3. 代码：clone 仓库，或把项目上传到服务器。
4. （可选）TronGrid API Key：到 [trongrid.io](https://www.trongrid.io) 免费注册获取；不填也能运行，只是免费公共节点高并发时会被限流。

**不需要准备：** 数据库、Redis、对象存储，或任何强制付费的第三方服务。

---

## 2. 方式一：Docker 部署（推荐）

### 2.1 安装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # 执行后重新登录一次使权限生效
```

> 走 Docker 方式**不需要**在宿主机装 Node / pnpm / pm2，运行环境已内置在镜像中。

### 2.2 拉取代码并配置环境变量

```bash
git clone <你的仓库地址> /opt/sentinel
cd /opt/sentinel

cp .env.example .env
# 编辑 .env：有 Key 就填 TRONGRID_API_KEY=xxxx，没有就留空
nano .env
```

### 2.3 构建并启动

```bash
docker compose build
docker compose up -d
docker compose ps          # 确认状态为 healthy
curl -I http://127.0.0.1:5000/   # 本机应返回 200
```

服务仅绑定在 `127.0.0.1:5000`，不直接暴露公网，由前置 Nginx 转发。

### 2.4 更新代码 / 重启 / 查看日志

```bash
cd /opt/sentinel
git pull
docker compose build && docker compose up -d
docker compose logs -f --tail=100
```

---

## 3. 方式二：裸机 pm2 部署

### 3.1 安装运行环境

```bash
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 9（项目锁定版本，切勿用 npm/yarn）
corepack enable
corepack prepare pnpm@9.0.0 --activate

# 进程守护 / 反向代理 / 证书 / 防火墙
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx git ufw
sudo npm i -g pm2
```

### 3.2 安装依赖与构建

```bash
git clone <你的仓库地址> /opt/sentinel
cd /opt/sentinel
pnpm install --frozen-lockfile
pnpm next:build
```

> `next:build` 实际执行 `next build --webpack`。Next 16 默认改用 Turbopack，
> 而本项目 `next.config.ts` 含 webpack 自定义，因此**必须带 `--webpack`**，直接 `next build` 会报错。

### 3.3 用 pm2 启动（务必绑 0.0.0.0）

```bash
TRONGRID_API_KEY=可选填你的key \
HOSTNAME=0.0.0.0 PORT=5000 \
pm2 start "pnpm next:start -H 0.0.0.0 -p 5000" --name sentinel

pm2 save
pm2 startup        # 按提示执行它输出的那条命令，实现开机自启
curl -I http://127.0.0.1:5000/
```

> 必须绑定 `0.0.0.0`；如果用默认 localhost，外网将无法访问。

---

## 4. 配置防火墙

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```

云厂商还需在**控制台安全组**同样放行 80 / 443；5000 端口不要对公网开放。

---

## 5. Nginx 反向代理 + HTTPS

项目已提供配置模板：`deploy/nginx/chain-sentinel.conf`。

```bash
sudo cp /opt/sentinel/deploy/nginx/chain-sentinel.conf \
        /etc/nginx/sites-available/chain-sentinel.conf

# 把里面的 your-domain.com 改成你的真实域名
sudo nano /etc/nginx/sites-available/chain-sentinel.conf

sudo ln -s /etc/nginx/sites-available/chain-sentinel.conf \
           /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

申请并自动配置 HTTPS 证书（certbot 会自动把配置改写为 443）：

```bash
sudo certbot --nginx -d 你的域名.com
```

certbot 安装后默认带定时续期，可用 `sudo certbot renew --dry-run` 验证。

> 模板中已把 `proxy_read_timeout` 放大到 40s，因为一次风险查询会串行调用多个 TronGrid 接口。

---

## 6. OFAC 名单定时更新（建议配置）

名单会持续变化，项目内置同步脚本 `pnpm sync:sdn`：从财政部官方 SDN CSV
提取字段 `Digital Currency Address - TRX`，用 tronweb 校验合法性、去重排序后
重写 `src/lib/risk/sdn-data.ts`；提取结果为 0 时会安全中止、不覆盖现有文件，
数量较上次波动超过 50% 会打印告警。

编辑 crontab：

```bash
crontab -e
```

**Docker 方式**（每天凌晨 4 点同步并重启容器加载新名单）：

- 如果宿主机装有 pnpm，可直接：

```cron
0 4 * * * cd /opt/sentinel && pnpm sync:sdn >> /var/log/sdn-sync.log 2>&1; docker compose restart sentinel >> /var/log/sdn-sync.log 2>&1
```

- 如果宿主机是纯 Docker 环境（没有 Node/pnpm），用附录 B 的 builder 容器方式，
  把其中「同步 + 重启」两条命令写进 cron。

**裸机方式：**

```cron
0 4 * * * cd /opt/sentinel && pnpm sync:sdn >> /var/log/sdn-sync.log 2>&1 && pm2 restart sentinel
```

也可随时手动执行一次验证：`pnpm sync:sdn`。

---

## 7. 环境变量说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `TRONGRID_API_KEY` | 否 | TronGrid 鉴权 Key，提高公共节点限流阈值；TronWeb 与原生 fetch 都会带上 |
| `PORT` | 否 | 服务端口，默认 5000 |
| `HOSTNAME` | 否 | 监听地址，生产必须 `0.0.0.0` |
| `NODE_ENV` | 否 | 生产设为 `production`（镜像已内置） |
| `SDN_SOURCE_URL` | 否 | 覆盖 OFAC 同步脚本的数据源，一般无需修改 |

---

## 8. 上线自检清单

- [ ] `curl -I http://127.0.0.1:5000/` 本机返回 200
- [ ] 浏览器访问 `https://你的域名/` 正常打开，证书有效
- [ ] 查询一个真实普通地址能出报告
- [ ] 查询 OFAC 制裁地址 `TASWbk6X1wiTku5TMmMQYqYFvshVEtfJy8` 返回 **高危 / 100 分 / tetherFrozen=true**
- [ ] 服务进程开机自启（`pm2 ls` 或 `docker compose ps` 为 healthy）
- [ ] 已配置 OFAC 名单每日同步 cron
- [ ] 5000 端口未对公网暴露，仅 Nginx 对外

---

## 9. 常见问题排查

| 现象 | 可能原因 / 处理 |
|---|---|
| 外网打不开、本机 curl 正常 | 没绑 `0.0.0.0`，或安全组 / ufw 未放行 80/443 |
| 页面能开、查询报错/超时 | 服务器无法出网访问 `api.trongrid.io`：`curl https://api.trongrid.io/v1/accounts/TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs` 测试；换节点地区或配置 Key |
| 频繁查询后失败 | 触发免费公共节点限流，申请并配置 `TRONGRID_API_KEY` |
| `pnpm next:build` 报 Turbopack/webpack 错误 | 必须用 `pnpm next:build`（带 `--webpack`），不要直接 `next build` |
| 1G 内存构建被 Killed | 内存不足，先加 swap（附录 A） |
| 证书申请失败 | 域名 A 记录未生效、80 端口未放行，或 Nginx 未加载该站点配置 |
| `docker compose build` 拉镜像慢 | 服务器到 Docker Hub 链路问题，配置镜像加速器 |

---

## 附录 A：为小内存服务器添加 2G swap

```bash
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # 确认 Swap 出现 2.0G
```

## 附录 B：纯 Docker 宿主机执行名单同步

生产运行镜像只安装了生产依赖（不含同步脚本所需的 `tsx`）。宿主机没有 Node/pnpm 时，
可用 Dockerfile 里的 `builder` 阶段（含完整开发依赖）挂载源码执行，更新结果直接写回宿主机：

```bash
cd /opt/sentinel

# 1) 构建一次含全部依赖的 builder 镜像
docker build --target builder -t sentinel-builder .

# 2) 用该镜像挂载源码跑同步（容器内写文件即写回宿主机目录）
docker run --rm -v /opt/sentinel:/app -w /app sentinel-builder pnpm sync:sdn

# 3) 重启服务加载新名单
docker compose restart sentinel
```

把第 2、3 步写进 cron 即可实现纯容器环境的每日自动更新。

---

_免责声明：本工具结果基于 Tether 合约公开状态、OFAC 公开制裁名单与近期链上交易自动分析，仅供风险参考，不构成法律、合规或投资建议，也不代表「绝对安全 / 永不冻结」的承诺。_
