import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// 숫자·ID·모델명 등 고정폭 표기용 모노 폰트 (Pretendard는 globals.css의 CDN @import로 로드)
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIOps 통합 관제 콘솔",
  description: "삼성클라우드플랫폼(SCP)·AWS 멀티테넌트 AIOps MSP 관제 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-motion="on" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
