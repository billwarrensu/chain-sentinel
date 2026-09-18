"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  Users,
  Network,
  AlertTriangle,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  ArrowUpLeft,
  MousePointerClick,
} from "lucide-react";
import type { RelationEdge } from "@/lib/risk/types";

const COLORS = {
  center: "#38bdf8", // 当前聚焦主体：冷青描边
  blacklist: "#f4494e", // 涉黑/制裁：警戒红
  exchange: "#f5a623", // 交易所：琥珀
  known: "#a78bfa", // 已知合约/项目
  normal: "#5c6478", // 普通对手：中性灰
  text: "#e6e9f0",
  sub: "#8b93a7",
};

interface Props {
  address: string;
  relations: RelationEdge[];
}

const MAX_DEPTH = 4; // 最深追踪层数（含初始层）

// 下钻栈中的每一层：聚焦某个地址，展示它的 1 层关系网
interface DrillLevel {
  address: string;
  label: string;
  relations: RelationEdge[];
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// 按交互金额对数映射节点大小
function nodeSize(edge: RelationEdge): number {
  const amt = Math.max(edge.totalAmount, 0);
  if (amt <= 0) return 14;
  return Math.min(44, Math.max(16, 10 + Math.log10(amt + 1) * 5));
}

export function AddressGraph({ address, relations }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const [showNoise, setShowNoise] = useState(false);
  const [copied, setCopied] = useState(false);

  // 下钻栈：第 0 层是初始查询地址
  const [stack, setStack] = useState<DrillLevel[]>([
    { address, label: "查询地址", relations },
  ]);
  const [loading, setLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // 当父级下发新的地址/relations（每次查询更新），重置下钻栈
  useEffect(() => {
    setStack([{ address, label: "查询地址", relations }]);
    setDrillError(null);
  }, [address, JSON.stringify(relations)]);

  const current = stack[stack.length - 1];
  const depth = stack.length;
  const atRoot = depth <= 1;
  const atMax = depth >= MAX_DEPTH;

  const visible = useMemo(
    () => current.relations.filter((r) => showNoise || !r.noise),
    [current.relations, showNoise],
  );

  const stats = useMemo(() => {
    const core = current.relations.filter((r) => !r.noise);
    const blacklisted = core.filter((r) => r.isBlacklisted).length;
    const exchanges = core.filter((r) => r.tag === "exchange").length;
    const totalAmt = core.reduce((s, r) => s + r.totalAmount, 0);
    return {
      nodes: core.length,
      blacklisted,
      exchanges,
      totalAmt:
        totalAmt >= 1000
          ? `${(totalAmt / 1000).toFixed(1)}k`
          : totalAmt.toFixed(0),
      noise: current.relations.length - core.length,
    };
  }, [current.relations]);

  // 下钻：对所选地址重新请求其 1 层关系网
  const drillDown = async (target: string) => {
    if (loading || atMax) return;
    setLoading(true);
    setDrillError(null);
    try {
      const res = await fetch(`/api/risk?address=${encodeURIComponent(target)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `查询失败（${res.status}）`);
      }
      const data = (await res.json()) as { relations?: RelationEdge[] };
      const rels = data.relations ?? [];
      setStack((prev) => [
        ...prev,
        { address: target, label: short(target), relations: rels },
      ]);
    } catch (err) {
      setDrillError(err instanceof Error ? err.message : "下钻查询失败");
    } finally {
      setLoading(false);
    }
  };

  // 返回某一层
  const backTo = (idx: number) => {
    if (idx < 0 || idx >= stack.length) return;
    setStack((prev) => prev.slice(0, idx + 1));
    setDrillError(null);
  };

  // 渲染当前层的力导向图
  useEffect(() => {
    if (!chartRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    const chart = instanceRef.current;

    const nodes: any[] = [
      {
        id: current.address,
        name: "当前地址",
        value: 0,
        symbolSize: 34,
        itemStyle: {
          color: "#0e1016",
          borderColor: COLORS.center,
          borderWidth: 2,
        },
        label: { show: true, color: COLORS.text, fontWeight: 600 },
        address: current.address,
        isCenter: true,
      },
      ...visible.map((r) => {
        const color = r.isBlacklisted
          ? COLORS.blacklist
          : r.tag === "exchange"
            ? COLORS.exchange
            : r.tag
              ? COLORS.known
              : COLORS.normal;
        const showLabel = r.isBlacklisted || !!r.tagName;
        return {
          id: r.address,
          name: showLabel
            ? (r.tagName ?? r.blacklistLabel ?? short(r.address))
            : short(r.address),
          value: r.totalAmount,
          symbolSize: nodeSize(r),
          itemStyle: {
            color,
            borderColor: r.isBlacklisted ? "#ff6b6f" : "#1f2430",
            borderWidth: r.isBlacklisted ? 2 : 1,
            opacity: 0.92,
          },
          label: { show: showLabel, fontSize: 10, color },
          edge: r,
        };
      }),
    ];

    const edgeColor = (d: string) =>
      d === "in" ? "#2ecc8f" : d === "out" ? "#f5a623" : "#38bdf8";

    const links = visible.map((r) => ({
      source: current.address,
      target: r.address,
      value: r.transferCount,
      lineStyle: {
        color: edgeColor(r.direction),
        width: Math.min(4, Math.max(1, Math.log2(r.transferCount + 1))),
        opacity: 0.5,
        curveness: 0.05,
      },
    }));

    chart.setOption(
      {
        backgroundColor: "transparent",
        animationDuration: 500,
        tooltip: {
          trigger: "item",
          confine: true,
          backgroundColor: "#0e1016",
          borderColor: "#1f2430",
          textStyle: { color: COLORS.text, fontSize: 12 },
          extraCssText: "box-shadow:0 10px 30px -10px rgba(0,0,0,.6)",
          formatter: (params: any) => {
            const d = params.data;
            if (d.isCenter) {
              return `<b style="font-family:ui-monospace,monospace">${d.address}</b><br/>当前聚焦地址${atMax ? "（已到最深分析层）" : ""}`;
            }
            const r = d.edge as RelationEdge;
            const dirText =
              r.direction === "in"
                ? "→ 流入本地址"
                : r.direction === "out"
                  ? "← 本地址流出"
                  : "⇄ 双向往来";
            const tag = r.isBlacklisted
              ? `<span style="color:#f4494e">● ${r.blacklistLabel ?? "涉黑/制裁"}</span>`
              : r.tagName
                ? `<span style="color:#f5a623">● ${r.tagName}</span>`
                : "";
            return [
              `<div style="font-family:ui-monospace,monospace">${r.address}</div>`,
              tag,
              `<div>${dirText}</div>`,
              `<div>交互 <b>${r.transferCount}</b> 笔 · 合计 <b>${r.totalAmount.toLocaleString()}</b> USDT</div>`,
              r.lastTransferAt
                ? `<div style="color:#8b93a7;font-size:11px">最近 <b>${new Date(r.lastTransferAt).toLocaleDateString("zh-CN")}</b></div>`
                : "",
              !atMax
                ? `<div style="color:#38bdf8;font-size:11px;margin-top:2px">↓ 点击此节点，下钻一层看它的资金网</div>`
                : "",
            ].join("<br/>");
          },
        },
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            edgeSymbol: ["none", "none"],
            force: {
              repulsion: 220,
              edgeLength: [60, 150],
              gravity: 0.08,
              friction: 0.6,
              layoutAnimation: true,
            },
            label: { show: true, position: "bottom" },
            emphasis: {
              focus: "adjacency",
              lineStyle: { width: 2, opacity: 0.9 },
              label: { show: true },
            },
            data: nodes,
            links,
          },
        ],
      },
      true,
    );

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [current.address, visible, atMax, stack.length]);

  // 点击节点：对手方节点触发下钻
  useEffect(() => {
    if (!chartRef.current || !instanceRef.current) return;
    const chart = instanceRef.current;
    const onClick = (params: any) => {
      const d = params.data;
      if (!d || !d.address) return;
      if (d.isCenter) return; // 点中心不动作
      if (atMax) return;
      drillDown(d.address);
    };
    chart.on("click", onClick);
    return () => {
      chart.off("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.address, atMax, loading]);

  const copyCenter = async () => {
    try {
      await navigator.clipboard.writeText(current.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1f2430]">
      {/* 下钻面包屑导航 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#1f2430] bg-[#0e1016] px-4 py-2.5">
        {stack.map((lv, i) => {
          const isLast = i === stack.length - 1;
          const label =
            i === 0
              ? lv.label
              : `${i}·${lv.label}`;
          return (
            <span key={`${lv.address}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#5c6478]" />}
              <button
                type="button"
                onClick={() => backTo(i)}
                className={`rounded px-1.5 py-0.5 font-mono-risk text-[11px] transition-colors ${
                  isLast
                    ? "bg-[#38bdf822] text-[#38bdf8]"
                    : "text-[#8b93a7] hover:bg-[#1f2430] hover:text-[#e6e9f0]"
                }`}
                title={isLast ? lv.address : `返回第 ${i + 1} 层：${lv.address}`}
              >
                {label}
              </button>
            </span>
          );
        })}
        <span className="ml-1 rounded px-1.5 py-0.5 text-[11px] text-[#5c6478]">
          第 {depth}/{MAX_DEPTH} 层
        </span>
        {!atRoot && (
          <button
            type="button"
            onClick={() => backTo(0)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#8b93a7] transition-colors hover:bg-[#1f2430] hover:text-[#e6e9f0]"
          >
            <ArrowUpLeft className="h-3 w-3" />
            回到查询地址
          </button>
        )}
      </div>

      {/* 图例 / 统计条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f2430] bg-[#0e1016] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b93a7]">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#5c6478]" /> 普通对手
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#f5a623]" /> 交易所
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#f4494e]" /> 涉黑/制裁
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#2ecc8f]" /> 流入本地址
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#f5a623]" /> 本地址流出
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8b93a7]">
          <span>
            关系 <b className="text-[#e6e9f0]">{stats.nodes}</b> 个
          </span>
          {stats.exchanges > 0 && <span>交易所 {stats.exchanges}</span>}
          {stats.blacklisted > 0 && (
            <span className="inline-flex items-center gap-1 text-[#f4494e]">
              <AlertTriangle className="h-3.5 w-3.5" />
              涉黑 {stats.blacklisted}
            </span>
          )}
        </div>
      </div>

      {/* 图区 + 加载态 */}
      <div className="relative">
        <div ref={chartRef} className="h-[460px] w-full bg-[#12141b]" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c12]/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-[#1f2430] bg-[#12141b] px-4 py-2 text-xs text-[#e6e9f0]">
              <Loader2 className="h-4 w-4 animate-spin text-[#38bdf8]" />
              正在拉取该地址的资金关系网…
            </div>
          </div>
        )}
      </div>

      {/* 底部控制 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1f2430] bg-[#0e1016] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8b93a7]">
            <input
              type="checkbox"
              checked={showNoise}
              onChange={(e) => setShowNoise(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#38bdf8]"
            />
            显示零星小额对手{stats.noise > 0 ? `（${stats.noise}）` : ""}
          </label>
          <button
            type="button"
            onClick={copyCenter}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#1f2430] px-2 py-1 text-xs text-[#e6e9f0] transition-colors hover:border-[#38bdf8] hover:text-[#38bdf8]"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[#2ecc8f]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            复制当前地址
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#5c6478]">
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="h-3.5 w-3.5" />
            点击节点下钻 · 滚轮缩放
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> 面包屑可返回上层
          </span>
        </div>
      </div>

      {/* 下钻错误提示 */}
      {drillError && (
        <div className="border-t border-[#f4494e33] bg-[#f4494e0d] px-4 py-2 text-xs text-[#f4494e]">
          ⚠ {drillError}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="flex flex-col items-center gap-3 border-t border-[#1f2430] bg-[#12141b] px-6 py-10 text-center">
          <Network className="h-7 w-7 text-[#5c6478]" />
          {atRoot ? (
            <p className="text-sm text-[#8b93a7]">
              该地址在取样范围内暂无可展示的 USDT 交易对手关系。
            </p>
          ) : (
            <p className="text-sm text-[#8b93a7]">
              该地址暂无更深一层的关系网，可通过面包屑返回上层继续分析。
            </p>
          )}
        </div>
      )}
    </div>
  );
}