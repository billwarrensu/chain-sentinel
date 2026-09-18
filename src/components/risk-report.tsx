"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  Info,
  ShieldAlert,
  ShieldCheck,
  Share2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import type {
  CheckItem,
  LinkedRisk,
  RiskLevel,
  TransferProfile,
} from "@/lib/risk/types";
import { ScoreRing } from "./score-ring";
import { AddressGraph } from "./address-graph";

const LEVEL_META: Record<
  RiskLevel,
  { label: string; color: string; advice: string }
> = {
  high: {
    label: "高危 · 建议拦截",
    color: "#f4494e",
    advice: "该地址存在官方冻结/制裁或与黑名单地址直接往来，请勿转账。",
  },
  medium: {
    label: "中险 · 谨慎交易",
    color: "#f5a623",
    advice: "存在可疑链上特征，建议小额测试、核实对手身份后再决定。",
  },
  low: {
    label: "低险 · 当前可放行",
    color: "#2ecc8f",
    advice: "当前未发现明显风险信号，但链上风险动态变化，不构成安全担保。",
  },
  unknown: {
    label: "未知",
    color: "#8b93a7",
    advice: "数据不足，无法判定。",
  },
};

const STATUS_META = {
  danger: { icon: ShieldAlert, color: "#f4494e" },
  warning: { icon: AlertTriangle, color: "#f5a623" },
  safe: { icon: CheckCircle2, color: "#2ecc8f" },
  info: { icon: Info, color: "#38bdf8" },
} as const;

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-2 inline-flex items-center text-[#8b93a7] transition-colors hover:text-[#38bdf8]"
      aria-label="复制地址"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[#2ecc8f]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function RiskReportView({
  report,
}: {
  report: import("@/lib/risk/types").RiskReport;
}) {
  const meta = LEVEL_META[report.level];
  const [tab, setTab] = useState<"report" | "graph">("report");

  return (
    <div className="animate-scan-in space-y-4">
      {/* 总览卡 */}
      <div
        className="rounded-2xl border p-6"
        style={{
          backgroundColor: "#12141b",
          borderColor: `${meta.color}55`,
          boxShadow: `0 0 0 1px ${meta.color}22, 0 20px 50px -20px ${meta.color}55`,
        }}
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <ScoreRing score={report.score} color={meta.color} label={meta.label} />
          <div className="min-w-0 flex-1 sm:px-6">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <span className="text-xs text-[#8b93a7]">查询地址</span>
              <code className="font-mono-risk break-all text-sm text-[#e6e9f0]">
                {report.address}
              </code>
              <CopyableAddress address={report.address} />
            </div>
            <p className="text-sm leading-relaxed text-[#c2c8d6]">
              {report.summary}
            </p>
            <p
              className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
              style={{ backgroundColor: `${meta.color}14`, color: meta.color }}
            >
              操作建议：{meta.advice}
            </p>
          </div>
        </div>
      </div>

      {/* 功能 Tab 切换 */}
      <div className="flex gap-1 rounded-xl border border-[#1f2430] bg-[#0e1016] p-1">
        <button
          type="button"
          onClick={() => setTab("report")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "report"
              ? "bg-[#1f2430] text-[#e6e9f0]"
              : "text-[#8b93a7] hover:text-[#e6e9f0]"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          地址安全体检
        </button>
        <button
          type="button"
          onClick={() => setTab("graph")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "graph"
              ? "bg-[#1f2430] text-[#e6e9f0]"
              : "text-[#8b93a7] hover:text-[#e6e9f0]"
          }`}
        >
          <Share2 className="h-4 w-4" />
          地址关系图谱
        </button>
      </div>

      {tab === "report" ? (
        <>
          {/* 检查项明细 */}
          <Section title="风险检查项">
            <ul className="divide-y divide-[#1f2430]">
              {report.checks.map((item) => (
                <CheckRow key={item.id} item={item} />
              ))}
            </ul>
          </Section>

          {/* 链上画像 */}
          {report.profile && (
            <Section title="链上画像">
              <ProfileGrid profile={report.profile} />
            </Section>
          )}

          {/* 关联风险地址 */}
          {report.linkedRisks.length > 0 && (
            <Section title={`关联风险地址（${report.linkedRisks.length}）`}>
              <ul className="space-y-2">
                {report.linkedRisks.map((r) => (
                  <LinkedRow key={r.address} risk={r} />
                ))}
              </ul>
            </Section>
          )}

          {/* 外链 */}
          <div className="flex items-center justify-between gap-4">
            <a
              href={report.tronscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#38bdf8] hover:underline"
            >
              在 TronScan 查看完整链上记录
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span className="text-xs text-[#5c6478]">
              查询时间 {new Date(report.queriedAt).toLocaleString("zh-CN")}
            </span>
          </div>
        </>
      ) : (
        // 地址关系图谱
        <AddressGraph address={report.address} relations={report.relations ?? []} />
      )}

      <p className="rounded-xl border border-[#1f2430] bg-[#0e1016] px-4 py-3 text-xs leading-relaxed text-[#6b7385]">
        免责声明：本结果基于 Tether 合约公开状态、OFAC 公开制裁名单与近期链上交易自动分析，
        仅供风险参考，不构成任何法律、合规或投资建议，也不代表「绝对安全」或「永不冻结」的承诺。
        关系图谱中的实体标签为公开信息整理，仅供识别参考，不代表对应实体本身安全或合规。
        链上标记具有滞后性，对手方付款银行卡是否涉案等链下信息无法通过本工具获知。请结合正规渠道与对手尽调综合判断。
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-[#1f2430] bg-[#12141b] p-5"
    >
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-[#e6e9f0]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckRow({ item }: { item: CheckItem }) {
  const s = STATUS_META[item.status];
  const Icon = s.icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon
        className="mt-0.5 h-5 w-5 shrink-0"
        style={{ color: s.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[#e6e9f0]">
            {item.title}
          </span>
          {item.weight > 0 && (
            <span
              className="font-mono-risk shrink-0 rounded px-1.5 py-0.5 text-[11px]"
              style={{ color: s.color, backgroundColor: `${s.color}1a` }}
            >
              +{item.weight}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#9aa2b5]">
          {item.detail}
        </p>
      </div>
    </li>
  );
}

function ProfileGrid({ profile }: { profile: TransferProfile }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "USDT 余额", value: `${profile.usdtBalance} USDT` },
    { label: "TRX 余额", value: `${profile.trxBalance} TRX` },
    {
      label: "取样 USDT 笔数",
      value: `${profile.totalTransfers} 笔`,
    },
    { label: "交易对手数", value: `${profile.uniqueCounterparties} 个` },
    { label: "流入 / 流出笔数", value: `${profile.inflowCount} / ${profile.outflowCount}` },
    {
      label: "流入 / 流出金额",
      value: `${profile.totalInflow.toLocaleString()} / ${profile.totalOutflow.toLocaleString()} USDT`,
    },
    {
      label: "首次 USDT 活动",
      value: profile.firstTransferAt
        ? new Date(profile.firstTransferAt).toLocaleDateString("zh-CN")
        : "无记录",
    },
    {
      label: "最近 USDT 活动",
      value: profile.lastTransferAt
        ? new Date(profile.lastTransferAt).toLocaleDateString("zh-CN")
        : "无记录",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-[#1f2430] bg-[#0e1016] px-3 py-2.5"
        >
          <div className="text-[11px] text-[#6b7385]">{it.label}</div>
          <div className="font-mono-risk mt-1 break-words text-sm text-[#e6e9f0]">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkedRow({ risk }: { risk: LinkedRisk }) {
  const DirIcon =
    risk.direction === "in"
      ? ArrowDownLeft
      : risk.direction === "out"
        ? ArrowUpRight
        : ArrowLeftRight;
  const dirText =
    risk.direction === "in"
      ? "接收过其资金"
      : risk.direction === "out"
        ? "向其转账"
        : "双向往来";
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-[#f4494e33] bg-[#f4494e0d] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#f4494e22] px-1.5 py-0.5 text-[11px] font-medium text-[#f4494e]">
            {risk.label}
          </span>
          <code className="font-mono-risk break-all text-xs text-[#e6e9f0]">
            {risk.address}
          </code>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#c2c8d6]">
        <DirIcon className="h-3.5 w-3.5 text-[#f4494e]" />
        <span>{dirText}</span>
        <span className="text-[#6b7385]">·</span>
        <span className="font-mono-risk">
          {risk.transferCount} 笔 / {risk.totalAmount.toLocaleString()} USDT
        </span>
      </div>
    </li>
  );
}
