import { lookupBlacklist } from "./blacklist";
import type { OnChainResult } from "./tron-data";
import type { CheckItem, RiskLevel, RiskReport } from "./types";
import { tronscanUrl } from "./tron";

// 评分权重（累计后截断到 100）
const W = {
  selfFrozen: 100, // 本人被 Tether 冻结
  selfSanctioned: 95, // 本人命中 OFAC
  linkedSanction: 60, // 与制裁地址直接交易
  linkedSanctionExtra: 12, // 每个额外制裁对手
  newAccount: 20, // 新地址
  highVelocity: 15, // 高周转（对手多、进出频繁）
  passThrough: 15, // 过账特征：流入≈流出
  noHistory: 10, // 几乎无 USDT 历史
} as const;

const DANGER_THRESHOLD = 70;
const MEDIUM_THRESHOLD = 30;

export function buildReport(
  address: string,
  onchain: OnChainResult,
): RiskReport {
  const checks: CheckItem[] = [];
  let score = 0;

  const selfHit = lookupBlacklist(address);

  // 1) Tether 官方冻结
  if (onchain.tetherFrozen) {
    score += W.selfFrozen;
    checks.push({
      id: "tether-frozen",
      title: "Tether 官方冻结名单",
      status: "danger",
      detail:
        "该地址已被 Tether 在 USDT 智能合约中列入黑名单（isBlackListed），其内 USDT 已被冻结，通常配合执法或制裁行动。严禁向其转账。",
      weight: W.selfFrozen,
    });
  } else {
    checks.push({
      id: "tether-frozen",
      title: "Tether 官方冻结名单",
      status: "safe",
      detail: "链上合约实时查询结果：该地址当前未被 Tether 冻结。",
      weight: 0,
    });
  }

  // 2) 本人命中 OFAC
  if (selfHit) {
    score += W.selfSanctioned;
    checks.push({
      id: "self-sanction",
      title: "OFAC 制裁名单（SDN）",
      status: "danger",
      detail: `该地址本身命中美国财政部 OFAC 特别指定国民名单（来源：${selfHit.source}）。${selfHit.note ?? ""}`,
      weight: W.selfSanctioned,
    });
  }

  // 3) 关联制裁地址
  const sanctions = onchain.linkedRisks;
  if (sanctions.length > 0) {
    const first = sanctions[0];
    score += W.linkedSanction;
    if (sanctions.length > 1) {
      score += (sanctions.length - 1) * W.linkedSanctionExtra;
    }
    const dirText = (d: "in" | "out" | "both") =>
      d === "in" ? "接收过其资金" : d === "out" ? "向其转过账" : "存在双向资金往来";
    checks.push({
      id: "linked-sanction",
      title: `关联风险地址（${sanctions.length}）`,
      status: "danger",
      detail: `取样范围内发现 ${sanctions.length} 个命中制裁/黑名单的直接交易对手。例如 ${first.address}（${first.label}），与其${dirText(first.direction)}，交互 ${first.transferCount} 笔、合计约 ${first.totalAmount.toLocaleString()} USDT。与这类地址直接往来可能导致资金被回溯牵连。`,
      weight: W.linkedSanction,
    });
  } else {
    checks.push({
      id: "linked-sanction",
      title: "关联风险地址",
      status: "safe",
      detail:
        "在取样的近期 USDT 交易中，未发现直接交易对手命中本地制裁/黑名单库。",
      weight: 0,
    });
  }

  const p = onchain.profile;

  // 4) 新地址
  if (p.isNewAccount && p.totalTransfers > 0) {
    score += W.newAccount;
    checks.push({
      id: "new-account",
      title: "地址活跃度",
      status: "warning",
      detail: "该地址首次 USDT 活动在近 30 天内，属于新活跃地址，缺少长期信用记录。",
      weight: W.newAccount,
    });
  } else {
    checks.push({
      id: "new-account",
      title: "地址活跃度",
      status: "info",
      detail: p.firstTransferAt
        ? `最早一笔 USDT 活动在 ${new Date(p.firstTransferAt).toISOString().slice(0, 10)}，具备一定历史。`
        : "未取到 USDT 转账历史。",
      weight: 0,
    });
  }

  // 5) 高周转特征
  const highVelocity =
    p.uniqueCounterparties >= 40 && p.totalTransfers >= 60;
  if (highVelocity) {
    score += W.highVelocity;
    checks.push({
      id: "velocity",
      title: "资金周转特征",
      status: "warning",
      detail: `交易频繁且对手分散（${p.totalTransfers} 笔、${p.uniqueCounterparties} 个对手），呈现高周转特征，常见于资金归集/跑分/过账类地址，需结合对手身份进一步判断。`,
      weight: W.highVelocity,
    });
  }

  // 6) 过账特征（流入≈流出，余额留存低）
  const flow = p.totalInflow + p.totalOutflow;
  const passThrough =
    flow > 1000 &&
    Math.min(p.totalInflow, p.totalOutflow) / Math.max(p.totalInflow, p.totalOutflow) > 0.85;
  if (passThrough) {
    score += W.passThrough;
    checks.push({
      id: "passthrough",
      title: "过账 / 归集特征",
      status: "warning",
      detail: `流入（约 ${p.totalInflow.toLocaleString()}）与流出（约 ${p.totalOutflow.toLocaleString()}）规模接近，资金过路、账户不留存，是洗钱/跑分地址的典型形态之一。`,
      weight: W.passThrough,
    });
  }

  // 7) 无历史 / 数据
  if (onchain.dataComplete && p.totalTransfers === 0) {
    score += W.noHistory;
    checks.push({
      id: "no-history",
      title: "USDT 交易历史",
      status: "warning",
      detail: "账户在链上存在，但取样范围内没有任何 USDT-TRC20 转账记录，无法用历史佐证其可信度。",
      weight: W.noHistory,
    });
  }

  if (!onchain.dataComplete) {
    checks.push({
      id: "data",
      title: "链上数据完整性",
      status: "info",
      detail: "部分链上数据本次未取到（可能是新账户或公共节点限流），结论仅供参考，建议稍后重试或在 TronScan 复核。",
      weight: 0,
    });
  }

  score = Math.min(100, score);

  let level: RiskLevel;
  if (score >= DANGER_THRESHOLD) level = "high";
  else if (score >= MEDIUM_THRESHOLD) level = "medium";
  else level = "low";

  const summary = buildSummary(level, address, !!selfHit, sanctions.length);

  return {
    address: address.trim(),
    queriedAt: Date.now(),
    valid: true,
    level,
    score,
    summary,
    checks,
    profile: p,
    linkedRisks: sanctions,
    tetherFrozen: onchain.tetherFrozen,
    tronscanUrl: tronscanUrl(address),
    dataComplete: onchain.dataComplete,
  };
}

function buildSummary(
  level: RiskLevel,
  address: string,
  selfSanctioned: boolean,
  linked: number,
): string {
  if (level === "high") {
    if (selfSanctioned) {
      return `地址 ${address} 本身命中官方冻结/制裁名单，属于明确高风险，绝对不要向其转账。`;
    }
    return `地址 ${address} 与 ${linked} 个制裁/黑名单地址存在直接资金往来，牵连风险高，建议放弃交易。`;
  }
  if (level === "medium") {
    return `地址 ${address} 未被官方冻结，但存在新账户、高周转或过账等可疑链上特征，建议提高警惕、小额测试并核实对手身份。`;
  }
  return `地址 ${address} 未被 Tether 冻结、未命中本地制裁库，近期交易对手也未发现黑名单关联，当前风险较低。但链上风险是动态变化的，本结论不构成安全担保。`;
}
