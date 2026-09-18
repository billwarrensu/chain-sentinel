"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { Users, Network, AlertTriangle } from "lucide-react";
import type { RelationEdge } from "@/lib/risk/types";

const COLORS = {
  center: "#38bdf8", // 查询主体：冷青描边
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
  const [copied, setCopied] = useState<string | null>(null);

  const visible = useMemo(
    () => relations.filter((r) => showNoise || !r.noise),
    [relations, showNoise],
  );

  const stats = useMemo(() => {
    const core = relations.filter((r) => !r.noise);
    const blacklisted = core.filter((r) => r.isBlacklisted).length;
    const exchanges = core.filter((r) => r.tag === "exchange").length;
    const totalAmt = core.reduce((s, r) => s + r.totalAmount, 0);
    return {
      nodes: core.length,
      blacklisted,
      exchanges,
      totalAmt: totalAmt >= 1000 ? `${(totalAmt / 1000).toFixed(1)}k` : totalAmt.toFixed(0),
      noise: relations.length - core.length,
    };
  }, [relations]);

  // 渲染力导向图
  useEffect(() => {
    if (!chartRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    const chart = instanceRef.current;

    const nodes: any[] = [
      {
        id: address,
        name: "查询地址",
        value: 0,
        symbolSize: 34,
        itemStyle: {
          color: "#0e1016",
          borderColor: COLORS.center,
          borderWidth: 2,
        },
        label: { show: true, color: COLORS.text, fontWeight: 600 },
        address,
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
          name: showLabel ? (r.tagName ?? r.blacklistLabel ?? short(r.address)) : short(r.address),
          value: r.totalAmount,
          symbolSize: nodeSize(r),
          itemStyle: {
            color,
            borderColor: r.isBlacklisted ? "#ff6b6f" : "#1f2430",
            borderWidth: r.isBlacklisted ? 2 : 1,
            opacity: 0.92,
          },
          label: {
            show: showLabel,
            fontSize: 10,
            color,
          },
          edge: r,
        };
      }),
    ];

    const edgeColor = (d: string) =>
      d === "in" ? "#2ecc8f" : d === "out" ? "#f5a623" : "#38bdf8";

    const links = visible.map((r) => ({
      source: address,
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
        animationDuration: 600,
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
              return `<b style="font-family:ui-monospace,monospace">${d.address}</b><br/>查询主体（当前地址）`;
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
            label: {
              show: true,
              position: "bottom",
            },
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
  }, [address, visible]);

  // 点击节点复制地址
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = instanceRef.current;
    if (!chart) return;
    const onClick = (params: any) => {
      const d = params.data;
      if (!d || !d.address) return;
      navigator.clipboard?.writeText(d.address).then(
        () => setCopied(d.address),
        () => setCopied(null),
      );
    };
    chart.on("click", onClick);
    return () => {
      chart.off("click", onClick);
    };
  }, [visible]);

  const copyLabel = copied ? "已复制" : "点击节点复制地址";

  if (relations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#1f2430] bg-[#12141b] px-6 py-12 text-center">
        <Network className="h-8 w-8 text-[#5c6478]" />
        <p className="text-sm text-[#8b93a7]">
          该地址在取样范围内暂无可展示的 USDT 交易对手关系。
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1f2430]">
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

      {/* 图区 */}
      <div ref={chartRef} className="h-[460px] w-full bg-[#12141b]" />

      {/* 底部控制 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1f2430] bg-[#0e1016] px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8b93a7]">
          <input
            type="checkbox"
            checked={showNoise}
            onChange={(e) => setShowNoise(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#38bdf8]"
          />
          显示零星小额对手{stats.noise > 0 ? `（${stats.noise}）` : ""}
        </label>
        <div className="flex items-center gap-3 text-xs text-[#5c6478]">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {copyLabel}
          </span>
          <span>滚轮缩放 · 拖动平移 · 点击节点查看</span>
        </div>
      </div>
    </div>
  );
}