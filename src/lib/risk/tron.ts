// 波场 / USDT 相关常量与地址工具
import { TronWeb } from "tronweb";

export const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // Tether USD (TRC20)
export const TRONGRID_BASE = "https://api.trongrid.io";
export const TRONSCAN_BASE = "https://tronscan.org/#/address";

// TronGrid API Key：可选。公共节点免费但有限流，申请后通过环境变量配置可提高限额。
// https://www.trongrid.io 注册即可免费获取。
export const TRONGRID_API_KEY =
  process.env.TRONGRID_API_KEY?.trim() || undefined;

// TronGrid 要求的鉴权头
export function trongridHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (TRONGRID_API_KEY) {
    headers["TRON-PRO-API-KEY"] = TRONGRID_API_KEY;
  }
  return headers;
}

// 单例 TronWeb（仅用于地址编码与合约只读调用）
let tronWebInstance: TronWeb | null = null;
export function getTronWeb(): TronWeb {
  if (!tronWebInstance) {
    tronWebInstance = new TronWeb({
      fullHost: TRONGRID_BASE,
      headers: TRONGRID_API_KEY
        ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY }
        : undefined,
    });
  }
  return tronWebInstance;
}

// 校验是否为合法波场地址（base58check，T 开头）
export function isValidTronAddress(address: string): boolean {
  const a = address.trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false;
  try {
    return getTronWeb().isAddress(a);
  } catch {
    return false;
  }
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export function tronscanUrl(address: string): string {
  return `${TRONSCAN_BASE}/${address}`;
}
