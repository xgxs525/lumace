import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "烁影 - 智能视频剪辑工具",
  description: "本地预览、AI 剪辑策划、时间线和 FFmpeg 自动渲染的一体化视频剪辑工作台。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
