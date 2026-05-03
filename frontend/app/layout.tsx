import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "react-hot-toast";
import { ApiBaseProvider, normalizeApiBaseUrl } from "@/providers/ApiBaseProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "NightAgent — AI Quant Layer for Jupiter Prediction Markets",
    template: "%s — NightAgent",
  },
  description:
    "Scan 3,400+ markets, find mispriced bets with Black-Scholes AI, and get Telegram alerts the moment there's real edge.",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
};

/** So `NEXT_PUBLIC_API_URL` is read when the page is rendered, not only at client bundle build. */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiBase = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <QueryProvider>
          <ApiBaseProvider apiBase={apiBase}>
            <AuthProvider>
              {children}
              <Toaster
                position="bottom-center"
                toastOptions={{
                  style: {
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-bright)",
                  },
                }}
              />
            </AuthProvider>
          </ApiBaseProvider>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
