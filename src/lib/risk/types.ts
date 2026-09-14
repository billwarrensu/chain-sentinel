// 风险查询领域的共享类型定义

// 风险等级
export type RiskLevel = "high" | "medium" | "low" | "unknown";

// 黑名单条目的风险类别
export type BlacklistCategory =
  | "tether_frozen" // Tether 官方冻结
  | "sanctions" // 制裁名单（OFAC 等公开信息）
  | "scam" // 诈骗 / 钓鱼
  | "gambling" // 涉赌资金
  | "mixer" // 混币 / 资金混淆
  | "stolen" // 被盗资金
  | "malicious"; // 其他恶意地址

// 本地黑名单条目
export interface BlacklistEntry {
  address: string;
  category: BlacklistCategory;
  label: string;
  source: string;
  note?: string;
}

// 单条检查项结果
export interface CheckItem {
  id: string;
  title: string;
  status: "danger" | "warning" | "safe" | "info";
  detail: string;
  weight: number; // 该命中项贡献的风险分（0-100）
}

// USDT 转账画像
export interface TransferProfile {
  usdtBalance: string; // 格式化后的 USDT 余额
  trxBalance: string; // 格式化后的 TRX 余额
  totalTransfers: number; // 取样范围内的 USDT 转账笔数
  firstTransferAt: number | null; // 最早一笔 USDT 转账时间（ms）
  lastTransferAt: number | null; // 最近一笔 USDT 转账时间（ms）
  uniqueCounterparties: number; // 去重后的交易对手数量
  inflowCount: number;
  outflowCount: number;
  totalInflow: number; // USDT
  totalOutflow: number; // USDT
  isNewAccount: boolean; // 首次 USDT 活动是否很新
}

// 命中黑名单的关联地址
export interface LinkedRisk {
  address: string;
  category: BlacklistCategory;
  label: string;
  direction: "in" | "out" | "both";
  transferCount: number;
  totalAmount: number;
  lastTransferAt: number | null;
}

// 一次查询的完整报告
export interface RiskReport {
  address: string;
  queriedAt: number;
  valid: boolean;
  level: RiskLevel;
  score: number; // 0-100
  summary: string;
  checks: CheckItem[];
  profile: TransferProfile | null;
  linkedRisks: LinkedRisk[];
  tetherFrozen: boolean;
  tronscanUrl: string;
  dataComplete: boolean; // 链上数据是否完整取到（接口失败时为 false）
}
