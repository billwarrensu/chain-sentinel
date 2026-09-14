import { NextRequest, NextResponse } from "next/server";
import { isValidTronAddress } from "@/lib/risk/tron";
import { analyzeOnChain } from "@/lib/risk/tron-data";
import { buildReport } from "@/lib/risk/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("address") ?? "";
  const address = raw.trim();

  if (!address) {
    return NextResponse.json(
      { valid: false, error: "缺少 address 参数" },
      { status: 400 },
    );
  }

  if (!isValidTronAddress(address)) {
    return NextResponse.json(
      {
        valid: false,
        error:
          "地址格式不合法，请输入 T 开头的 34 位波场（TRON）TRC20 地址。",
      },
      { status: 400 },
    );
  }

  try {
    const onchain = await analyzeOnChain(address);
    const report = buildReport(address, onchain);
    return NextResponse.json(report, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { valid: false, error: `链上查询失败：${message}` },
      { status: 502 },
    );
  }
}
