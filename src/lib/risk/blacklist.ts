import type { BlacklistCategory, BlacklistEntry } from "./types";
import { SDN_TRON_ADDRESSES } from "./sdn-data";

// 本地黑名单库。
// 数据来源：美国财政部 OFAC 公开 SDN 名单（字段 "Digital Currency Address - TRX"）。
// 这些地址均为公开制裁对象，且其 USDT 已被 Tether 配合冻结。
// 用途：
//   1) 直接命中——被查询地址本身在名单内；
//   2) 关联识别——判断该地址的交易对手是否为制裁地址（官方合约接口只能查"自身"是否冻结）。
// 注意：名单会持续更新，生产环境应定期从官方源同步；标签如有出入以 OFAC 官方为准并提供申诉。

const RAW: Array<Omit<BlacklistEntry, "address"> & { address: string }> =
  SDN_TRON_ADDRESSES.map((address) => ({
    address,
    category: "sanctions" as BlacklistCategory,
    label: "OFAC 制裁地址 (SDN)",
    source: "OFAC SDN List",
    note: "美国财政部特别指定国民名单中标记的 TRON 地址，禁止美国主体与其交易",
  }));

export const BLACKLIST: BlacklistEntry[] = RAW.map((r) => ({
  ...r,
  address: r.address.trim(),
}));

// 以地址为键的索引，O(1) 查询
const ADDRESS_MAP = new Map<string, BlacklistEntry>(
  BLACKLIST.map((e) => [e.address, e]),
);

export function lookupBlacklist(address: string): BlacklistEntry | undefined {
  return ADDRESS_MAP.get(address.trim());
}

// 分类的中文展示名
export const CATEGORY_LABEL: Record<BlacklistCategory, string> = {
  tether_frozen: "Tether 官方冻结",
  sanctions: "制裁名单",
  scam: "诈骗 / 钓鱼",
  gambling: "涉赌资金",
  mixer: "混币 / 资金混淆",
  stolen: "被盗资金",
  malicious: "恶意地址",
};
