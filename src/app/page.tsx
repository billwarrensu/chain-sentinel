import { RiskChecker } from "@/components/risk-checker";
import { Radar } from "lucide-react";

export default function Home() {
  return (
    <main className="risk-terminal min-h-screen text-[#e6e9f0]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        {/* 品牌 */}
        <header className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#38bdf844] bg-[#38bdf814]">
            <Radar className="h-5 w-5 text-[#38bdf8]" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-wide">
              链上哨兵
            </div>
            <div className="text-xs text-[#6b7385]">
              TRON USDT 地址风险核验
            </div>
          </div>
        </header>

        {/* 价值说明 */}
        <section className="mb-8">
          <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">
            转账前，先看清对方地址干不干净
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#9aa2b5]">
            输入对方的波场
            <span className="font-mono-risk text-[#c2c8d6]"> TRC20-USDT </span>
            地址，工具会实时核验
            <span className="text-[#e6e9f0]"> Tether 官方冻结状态</span>、比对
            <span className="text-[#e6e9f0]"> OFAC 制裁名单</span>
            ，并分析该地址近期是否与涉黑/制裁地址有直接资金往来，给出可解释的风险等级。
          </p>
        </section>

        {/* 查询主体 */}
        <RiskChecker />

        <footer className="mt-auto pt-12 text-center text-xs text-[#4b5264]">
          数据来源：TronGrid 公共节点 · Tether USD 合约 · OFAC SDN List
        </footer>
      </div>
    </main>
  );
}
