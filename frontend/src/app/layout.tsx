import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { HeaderActions } from "@/components/HeaderActions";
import { ToastProvider } from "@/components/ToastProvider";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dhaka Tesla Pool — Smart Ride Sharing in Dhaka",
  description:
    "Book premium Tesla pool rides across Dhaka. Match with other passengers going the same direction and split the fare.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col bg-[var(--background)]">
        <AuthProvider>
          <header className="sticky top-0 z-40 border-b border-[var(--card-border)] bg-[var(--card)]/90 backdrop-blur-md">
            <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/rides" className="flex items-center gap-2.5 group">
                {/* Tesla-inspired lightning bolt */}
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 shadow-sm group-hover:bg-amber-400 transition-colors">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5 text-white"
                    aria-hidden="true"
                  >
                    <path d="M13 2L4.09 12.97 11.5 12l-1.5 9 8.91-10.97H11.5L13 2z" />
                  </svg>
                </div>
                <div>
                  <span className="text-base font-bold tracking-tight text-[var(--foreground)]">
                    Dhaka Tesla Pool
                  </span>
                </div>
              </Link>
              <HeaderActions />
            </nav>
          </header>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <footer className="mt-auto border-t border-[var(--card-border)] py-6">
          <div className="mx-auto max-w-6xl px-4 text-center text-xs text-[var(--muted-foreground)]">
            © 2026 Dhaka Tesla Pool · Premium pool rides across Dhaka
          </div>
        </footer>
      </body>
    </html>
  );
}