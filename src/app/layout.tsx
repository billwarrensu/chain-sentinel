import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '链上哨兵 · 波场 USDT 地址风险查询',
    template: '%s | 链上哨兵',
  },
  description:
    '转账前查询波场 TRC20-USDT 地址风险：实时核验 Tether 官方冻结名单、OFAC 制裁地址，并分析与涉黑地址的直接资金牵连。',
  keywords: [
    'USDT',
    'TRC20',
    '波场',
    'TRON',
    '地址风险查询',
    '涉黑地址',
    '冻卡',
    'Tether 冻结',
    'OFAC 制裁',
    '链上反洗钱',
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
