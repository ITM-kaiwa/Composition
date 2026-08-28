import type { Metadata } from "next";
import { BIZ_UDPMincho } from "next/font/google";
import "./globals.css";

// BIZ UDPMincho is Morisawa/Fontworks' Universal Design Mincho family,
// explicitly designed for and modeled after Japanese school-textbook print
// (kyoukasho-tai) -- the closest widely-available web font to "教科書体".
const kyokasho = BIZ_UDPMincho({
  weight: ["400", "700"],
  subsets: ["latin"],
  preload: false,
  variable: "--font-kyokasho",
});

export const metadata: Metadata = {
  title: "呪文バトル - みんなの日本語 文法組み立てゲーム",
  description:
    "「みんなの日本語」の例文をドラッグ&ドロップで並び替えて呪文を完成させ、モンスターを倒すドラクエ風の文法バトルゲーム。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={kyokasho.variable}>
      <body className="min-h-screen bg-sand-100 text-sand-800 antialiased">{children}</body>
    </html>
  );
}
