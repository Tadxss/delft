import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";

const DESCRIPTION = "A private, personal records and notes workspace.";

export const metadata: Metadata = {
  title: "Delft",
  description: DESCRIPTION,
  openGraph: {
    title: "Delft",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Delft",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-paper-50 font-sans text-ink-800">
        <ThemeProvider attribute="class" defaultTheme="system">
          <Providers>{children}</Providers>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
