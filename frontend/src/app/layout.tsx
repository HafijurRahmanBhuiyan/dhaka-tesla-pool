import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dhaka Tesla Pool",
  description: "Ride-pooling platform for Tesla owners in Dhaka",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 py-4 dark:border-zinc-800">
          <nav className="mx-auto w-full max-w-5xl px-4">
            <span className="text-lg font-semibold tracking-tight">
              Dhaka Tesla Pool
            </span>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}