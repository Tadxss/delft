import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Delft",
  description: "A private, personal records and notes workspace.",
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
      </body>
    </html>
  );
}
