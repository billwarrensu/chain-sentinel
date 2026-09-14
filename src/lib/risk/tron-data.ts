import { getTronWeb, TRONGRID_BASE, USDT_CONTRACT, trongridHeaders } from "./tron";
import { lookupBlacklist } from "./blacklist";
import type { LinkedRisk, TransferProfile } from "./types";

const USDT_DECIMALS = 6;
const SAMPLE_LIMIT = 200; // 免费 API 单次最多取 200 条做关联分析
const REQUEST_TIMEOUT = 12000;

interface Trc20Record {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info?: { symbol?: string; address?: string; decimals?: number };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: trongridHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// 查询 USDT 合约的官方冻结状态（isBlackListed）
export async function fetchTetherFrozen(address: string): Promise<boolean> {
  const tw = getTronWeb();
  const res = await tw.transactionBuilder.triggerConstantContract(
    USDT_CONTRACT,
    "isBlackListed(address)",
    {},
    [{ type: "address", value: address }],
    USDT_CONTRACT,
  );
  const r = (res as { constant_result?: string[] }).constant_result?.[0];
  return r === "1".padStart(64, "0");
}

// 查询 USDT 余额（balanceOf），返回格式化字符串
export async function fetchUsdtBalance(address: string): Promise<string> {
  const tw = getTronWeb();
  const res = await tw.transactionBuilder.triggerConstantContract(
    USDT_CONTRACT,
    "balanceOf(address)",
    {},
    [{ type: "address", value: address }],
    address,
  );
  const hex = (res as { constant_result?: string[] }).constant_result?.[0];
  if (!hex) return "0";
  const raw = BigInt("0x" + hex);
  return (Number(raw) / 10 ** USDT_DECIMALS).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

interface AccountData {
  create_time?: number;
  balance?: number; // SUN
}

// 账户基础信息 + TRX 余额
async function fetchAccount(address: string): Promise<AccountData | null> {
  try {
    const json = await fetchJson<{ data?: AccountData[] }>(
      `${TRONGRID_BASE}/v1/accounts/${address}`,
    );
    return json.data?.[0] ?? null;
  } catch {
    return null;
  }
}

// 拉取取样范围内的 USDT-TRC20 转账记录（双向）
async function fetchTransfers(address: string): Promise<Trc20Record[]> {
  const url =
    `${TRONGRID_BASE}/v1/accounts/${address}/transactions/trc20` +
    `?contract_address=${USDT_CONTRACT}&limit=${SAMPLE_LIMIT}`;
  const json = await fetchJson<{ data?: Trc20Record[] }>(url);
  return json.data ?? [];
}

function toUsdt(raw: string): number {
  return Number(BigInt(raw)) / 10 ** USDT_DECIMALS;
}

// 由转账记录生成画像与关联风险
export function buildProfileAndLinks(
  address: string,
  records: Trc20Record[],
  trxBalance: string,
  usdtBalance: string,
  account: AccountData | null,
): { profile: TransferProfile; linkedRisks: LinkedRisk[] } {
  const target = address.trim();
  const counterparties = new Map<
    string,
    {
      direction: Set<"in" | "out">;
      count: number;
      amount: number;
      last: number | null;
    }
  >();

  let inflowCount = 0;
  let outflowCount = 0;
  let totalInflow = 0;
  let totalOutflow = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  for (const r of records) {
    const ts = r.block_timestamp;
    if (ts) {
      firstTs = firstTs === null ? ts : Math.min(firstTs, ts);
      lastTs = lastTs === null ? ts : Math.max(lastTs, ts);
    }
    const amount = toUsdt(r.value);
    if (r.to === target) {
      inflowCount += 1;
      totalInflow += amount;
    } else if (r.from === target) {
      outflowCount += 1;
      totalOutflow += amount;
    }

    const cp = r.to === target ? r.from : r.to;
    if (!cp || cp === target) continue;
    const dir: "in" | "out" = r.to === target ? "in" : "out";
    const cur =
      counterparties.get(cp) ??
      ({ direction: new Set(), count: 0, amount: 0, last: null } as {
        direction: Set<"in" | "out">;
        count: number;
        amount: number;
        last: number | null;
      });
    cur.direction.add(dir);
    cur.count += 1;
    cur.amount += amount;
    cur.last = cur.last === null ? ts : Math.max(cur.last, ts ?? 0);
    counterparties.set(cp, cur);
  }

  const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const firstActivity = firstTs ?? account?.create_time ?? null;
  const isNewAccount =
    firstActivity !== null && Date.now() - firstActivity < NEW_WINDOW_MS;

  const profile: TransferProfile = {
    usdtBalance,
    trxBalance,
    totalTransfers: records.length,
    firstTransferAt: firstTs,
    lastTransferAt: lastTs,
    uniqueCounterparties: counterparties.size,
    inflowCount,
    outflowCount,
    totalInflow: round2(totalInflow),
    totalOutflow: round2(totalOutflow),
    isNewAccount,
  };

  // 关联风险：交易对手命中黑名单
  const linkedRisks: LinkedRisk[] = [];
  for (const [cp, agg] of counterparties) {
    const hit = lookupBlacklist(cp);
    if (!hit) continue;
    const direction: "in" | "out" | "both" =
      agg.direction.size === 2
        ? "both"
        : agg.direction.has("in")
          ? "in"
          : "out";
    linkedRisks.push({
      address: cp,
      category: hit.category,
      label: hit.label,
      direction,
      transferCount: agg.count,
      totalAmount: round2(agg.amount),
      lastTransferAt: agg.last,
    });
  }
  linkedRisks.sort((a, b) => b.transferCount - a.transferCount);

  return { profile, linkedRisks };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OnChainResult {
  profile: TransferProfile;
  linkedRisks: LinkedRisk[];
  tetherFrozen: boolean;
  dataComplete: boolean;
}

// 汇总一次完整的链上取证
export async function analyzeOnChain(address: string): Promise<OnChainResult> {
  const [frozen, usdtBalance, account, records] = await Promise.all([
    fetchTetherFrozen(address).catch(() => false),
    fetchUsdtBalance(address).catch(() => "0"),
    fetchAccount(address),
    fetchTransfers(address).catch(() => [] as Trc20Record[]),
  ]);

  const trxBalance = account
    ? ((account.balance ?? 0) / 1_000_000).toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })
    : "0";

  const { profile, linkedRisks } = buildProfileAndLinks(
    address,
    records,
    trxBalance,
    usdtBalance,
    account,
  );

  return {
    profile,
    linkedRisks,
    tetherFrozen: frozen,
    dataComplete: account !== null,
  };
}
