import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "create-context-hub | Shared AI context in one command",
  description:
    "Install create-context-hub to deploy a personal MCP context layer shared across Claude, ChatGPT, Perplexity, Cursor, and other AI clients.",
  metadataBase: new URL("https://context-hub.dev"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "create-context-hub",
    description:
      "One npm command to deploy a Cloudflare-backed MCP context hub for every AI client you use.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
