import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HeaderActions } from "@/components/HeaderActions";
import { ToastProvider } from "@/components/ToastProvider";

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
          <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-4">
            <div className="flex items-center gap-6">
              <Link href="/rides" className="text-lg font-semibold tracking-tight">
                Dhaka Tesla Pool
              </Link>
              <div className="flex items-center gap-1 text-sm">
                <Link
                  href="/rides"
                  className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Rides
                </Link>
                <Link
                  href="/rides/new"
                  className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Request a ride
                </Link>
              </div>
            </div>
            <HeaderActions />
          </nav>
        </header>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}