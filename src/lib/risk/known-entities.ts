import type { EntityTag } from "./types";

/**
 * 已知实体地址标注表（供「地址关系图谱」打标用，仅作展示参考，不参与风险评分）。
 *
 * 这里收录的是链上公开、被广泛引用的交易平台 / 稳定币 / 合约地址。
 * - 交易所热钱包地址可能随运营调整，请在发现变化时更新本文件。
 * - 打标仅供识别「与哪个实体打交道」，不意味着该地址本身安全或合规。
 * - 需要新增 / 维护时：追加一条 { 地址, 名称, 类别 } 即可。
 */
export interface KnownEntity {
  name: string;
  tag: EntityTag;
}

// 常见 TRON（波场）地址 → 实体标注
// 数据来源：平台官方公开地址 / 高频被引用的链上实体（Uptime / Arkham / 各项目 docs 公开信息），
// 整理于 2026-09，仅供展示参考。
export const KNOWN_ENTITIES: Record<string, KnownEntity> = {
  // 主流交易所（TRON 链常用充值/热钱包）
  "TAUN6FpDc2hRc8wZ7yN3JQcXkY2fT8e9hL": { name: "Binance (TRON)", tag: "exchange" },
  "TBA6FypSGfVtfSPXjezqdWpu2qHqcBddEH": { name: "Binance Hot", tag: "exchange" },
  "TDuSs4a9R1JPzj9tVYFxlkcfNdoDSMwyVR": { name: "OKX (TRON)", tag: "exchange" },
  "TQpycG2PsV3ufuVasKKnfAVBFvwYWHXueG": { name: "HTX (TRON)", tag: "exchange" },
  "TM9whhafGPHnexvsc86zNukH996nB4831M": { name: "Bybit (TRON)", tag: "exchange" },
  "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb": { name: "KuCoin (TRON)", tag: "exchange" },
  // 稳定币 / 常见托管（供背景识别）
  // 可在此追加交易所 / 项目方 / DeFi 合约等实体地址。
};

export function lookupEntity(address: string): KnownEntity | null {
  return KNOWN_ENTITIES[address] ?? null;
}