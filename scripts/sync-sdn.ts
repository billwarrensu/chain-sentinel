/**
 * OFAC SDN 名单 —— TRON 地址同步脚本
 *
 * 作用：从美国财政部官方 SDN CSV 中提取字段 "Digital Currency Address - TRX"
 *       对应的全部波场地址，用 tronweb 校验合法性、去重排序后，
 *       重新生成 src/lib/risk/sdn-data.ts 与 scripts/sdn_tron.txt。
 *
 * 用法：
 *   pnpm sync:sdn
 *   SDN_SOURCE_URL=https://... pnpm sync:sdn   # 覆盖数据源
 *
 * 建议：在服务器上用 cron 定期执行（例如每天一次），并在地址数量异常变化时人工复核。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TronWeb } from "tronweb";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_SOURCE =
  "https://www.treasury.gov/ofac/downloads/sdn.csv";
const SOURCE_URL = process.env.SDN_SOURCE_URL?.trim() || DEFAULT_SOURCE;

const OUT_TXT = resolve(ROOT, "scripts/sdn_tron.txt");
const OUT_TS = resolve(ROOT, "src/lib/risk/sdn-data.ts");

const FETCH_TIMEOUT_MS = 30_000;

function log(msg: string): void {
  console.log(`[sync:sdn] ${msg}`);
}

async function downloadCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/csv, text/plain, */*" },
    });
    if (!res.ok) {
      throw new Error(`下载失败：HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 从 CSV 文本中精确提取 "Digital Currency Address - TRX <T...34>" 地址
function extractTronAddresses(csv: string): string[] {
  const re = /Digital Currency Address - TRX (T[1-9A-HJ-NP-Za-km-z]{33})/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(csv)) !== null) {
    set.add(m[1]);
  }
  return [...set];
}

function buildTs(addresses: string[]): string {
  const body = addresses.map((a) => `  "${a}",`).join("\n");
  return `// OFAC SDN 名单中被标记的 TRON 地址（字段 "Digital Currency Address - TRX"）。
// 来源：美国财政部 OFAC 公开 SDN 名单 https://www.treasury.gov/ofac/downloads/sdn.csv
// 本文件由 scripts/sync-sdn.ts 自动生成，请勿手工编辑；更新请运行 \`pnpm sync:sdn\`。
// 抓取后经链上校验：地址全部为合法波场地址。

export const SDN_TRON_ADDRESSES: string[] = [
${body}
];
`;
}

async function main(): Promise<void> {
  log(`从 ${SOURCE_URL} 下载 SDN 名单…`);
  const csv = await downloadCsv(SOURCE_URL);
  log(`CSV 大小：${(csv.length / 1024 / 1024).toFixed(2)} MB`);

  const raw = extractTronAddresses(csv);
  log(`正则提取到 ${raw.length} 个去重候选地址`);

  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
  const valid: string[] = [];
  let invalid = 0;
  for (const addr of raw) {
    let ok = false;
    try {
      ok = tronWeb.isAddress(addr);
    } catch {
      ok = false;
    }
    if (ok) valid.push(addr);
    else invalid += 1;
  }
  valid.sort();
  log(`合法 ${valid.length} 个，非法剔除 ${invalid} 个`);

  if (valid.length === 0) {
    throw new Error("未提取到任何合法地址，疑似数据源或解析异常，已中止（不覆盖现有文件）。");
  }

  // 与现有清单对比，便于在 CI/cron 中观察剧烈变化
  let previousCount = 0;
  try {
    const old = await readFile(OUT_TXT, "utf8");
    previousCount = old.split("\n").filter((s) => s.trim()).length;
  } catch {
    previousCount = 0;
  }
  if (previousCount > 0) {
    const delta = valid.length - previousCount;
    log(`较上次变化：${previousCount} -> ${valid.length}（${delta >= 0 ? "+" : ""}${delta}）`);
    if (Math.abs(delta) / previousCount > 0.5) {
      log("警告：地址数量波动超过 50%，请人工确认数据源是否正常。");
    }
  }

  await mkdir(dirname(OUT_TS), { recursive: true });
  await writeFile(OUT_TXT, valid.join("\n") + "\n", "utf8");
  await writeFile(OUT_TS, buildTs(valid), "utf8");
  log(`已写入 ${OUT_TXT} 与 ${OUT_TS}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[sync:sdn] 失败：${message}`);
  process.exit(1);
});
