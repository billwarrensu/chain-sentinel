"use client";

import { useState } from "react";
import { Search, Loader2, ClipboardPaste, ShieldCheck } from "lucide-react";
import { RiskReportView } from "./risk-report";
import type { RiskReport } from "@/lib/risk/types";

type Status = "idle" | "loading" | "success" | "error";

const SCAN_STEPS = [
  "校验地址格式",
  "查询 Tether 官方冻结状态",
  "拉取链上账户与转账画像",
  "比对制裁名单与关联地址",
  "计算风险评分",
];

export function RiskChecker() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [report, setReport] = useState<RiskReport | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setAddress(text.trim());
    } catch {
      /* 无剪贴板权限时忽略 */
    }
  };

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const addr = address.trim();
    if (!addr) {
      setStatus("error");
      setError("请先输入要查询的波场地址。");
      return;
    }
    setStatus("loading");
    setError("");
    setReport(null);
    try {
      const res = await fetch(
        `/api/risk?address=${encodeURIComponent(addr)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json.valid) {
        throw new Error(json.error || "查询失败，请稍后重试。");
      }
      setReport(json as RiskReport);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败，请稍后重试。");
      setStatus("error");
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={check} className="relative">
        <div className="flex flex-col gap-3 rounded-2xl border border-[#1f2430] bg-[#12141b] p-3 focus-within:border-[#38bdf888] sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3 px-2">
            <span className="hidden shrink-0 rounded-md border border-[#1f2430] bg-[#0e1016] px-2 py-1 text-xs font-medium text-[#8b93a7] sm:inline">
              TRC20
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="输入 T 开头的波场地址，例如 Txxxx…（共 34 位）"
              className="font-mono-risk h-11 w-full bg-transparent text-sm text-[#e6e9f0] placeholder:font-sans placeholder:text-[#5c6478] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePaste}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#1f2430] px-3 text-sm text-[#9aa2b5] transition-colors hover:border-[#38bdf866] hover:text-[#38bdf8]"
            >
              <ClipboardPaste className="h-4 w-4" />
              <span className="sm:hidden">粘贴</span>
            </button>
            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#38bdf8] px-6 text-sm font-semibold text-[#06121c] transition-colors hover:bg-[#5cc9f9] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              风险查询
            </button>
          </div>
        </div>
      </form>

      {status === "error" && (
        <p className="mt-3 rounded-lg border border-[#f4494e33] bg-[#f4494e12] px-4 py-2.5 text-sm text-[#f4494e]">
          {error}
        </p>
      )}

      {status === "loading" && <ScanningPanel />}

      {status === "success" && report && (
        <div className="mt-6">
          <RiskReportView report={report} />
        </div>
      )}

      {status !== "loading" && status !== "success" && <TrustNote />}
    </div>
  );
}

function ScanningPanel() {
  return (
    <div className="mt-6 rounded-2xl border border-[#1f2430] bg-[#12141b] p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#e6e9f0]">
        <Loader2 className="h-4 w-4 animate-spin text-[#38bdf8]" />
        正在执行链上安全检查…
      </div>
      <ul className="space-y-3">
        {SCAN_STEPS.map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-3 text-sm text-[#9aa2b5]"
            style={{
              animation: "scan-in 0.4s both",
              animationDelay: `${i * 0.25}s`,
            }}
          >
            <ShieldCheck className="h-4 w-4 text-[#38bdf8]" />
            {step}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrustNote() {
  const points = [
    { t: "官方冻结核验", d: "实时调用 USDT 合约 isBlackListed" },
    { t: "OFAC 制裁名单", d: "内置公开 SDN 波场地址并持续同步" },
    { t: "一跳牵连分析", d: "识别交易对手中的黑名单地址" },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {points.map((p) => (
        <div
          key={p.t}
          className="rounded-xl border border-[#1f2430] bg-[#0e1016] px-4 py-3"
        >
          <div className="text-sm font-medium text-[#c2c8d6]">{p.t}</div>
          <div className="mt-1 text-xs text-[#6b7385]">{p.d}</div>
        </div>
      ))}
    </div>
  );
}
