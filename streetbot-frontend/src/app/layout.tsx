import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { AguiProvider } from "./providers/agui-provider";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Street Bot",
  description:
    "Street Bot helps social workers discover community resources in seconds.",
  openGraph: {
    title: "Street Bot",
    description:
      "Street Bot helps social workers discover community resources in seconds.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Street Bot",
    description:
      "Street Bot helps social workers discover community resources in seconds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${rubik.variable} antialiased bg-[#101218] text-white`}>
        <AguiProvider>{children}</AguiProvider>
      </body>
    </html>
  );
}
