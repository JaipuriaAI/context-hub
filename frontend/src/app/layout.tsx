import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";

// Raleway: 200 (extraLight) for "Hub" half of the wordmark + light accents,
// 400 (regular) for "Context" half + body, 600 (semiBold) for headings,
// 700 (bold) for hero headlines. Mirrors Rehearsal's brand DNA weight system.
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["200", "400", "600", "700"],
  variable: "--font-raleway",
  display: "swap",
});

// Production canonical URL — used as metadataBase so og:image / twitter:image
// resolve to absolute URLs scrapers (WhatsApp, X, LinkedIn) can actually fetch.
// If NEXT_PUBLIC_SITE_URL is set in the deploy env it overrides this fallback.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://contexthub.tryrehearsal.ai";
const SITE_NAME = "Context Hub";
const TAGLINE = "Your AI context. Connected everywhere.";
const DESCRIPTION =
  "Context Hub is a personal MCP context layer shared by Claude, ChatGPT, Cursor, Perplexity, Claude Code, and Codex. One npm command stands up a Cloudflare-backed memory hub for every AI client you use.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "MCP",
    "Model Context Protocol",
    "AI memory",
    "Claude",
    "ChatGPT",
    "Cursor",
    "Perplexity",
    "Claude Code",
    "Codex",
    "Cloudflare Workers",
    "D1",
    "context hub",
    "create-context-hub",
    "AI tools",
    "developer tools",
  ],
  authors: [{ name: "Mayank Bohra", url: "https://github.com/mayankbohradev" }],
  creator: "Mayank Bohra",
  publisher: "Context Hub",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    locale: "en_US",
    // OG image auto-included via app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    creator: "@mayankbohradev",
    // Twitter image auto-included via app/twitter-image.tsx
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // icon.svg / apple-icon are picked up from app/ via Next file conventions
  manifest: "/manifest.webmanifest",
  referrer: "origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Structured data (Organization + WebSite + SoftwareApplication) for rich AI/SEO results.
// All fields are hardcoded constants in this file — no user input, no XSS surface.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [
        "https://github.com/mayankbohradev/context-hub",
        "https://www.npmjs.com/package/create-context-hub",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}#org` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#app`,
      name: "create-context-hub",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      url: SITE_URL,
      downloadUrl: "https://www.npmjs.com/package/create-context-hub",
      installUrl: "https://www.npmjs.com/package/create-context-hub",
      softwareRequirements: "Node.js 18+, Cloudflare account",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      author: { "@id": `${SITE_URL}#org` },
      description:
        "One-command CLI to deploy a Cloudflare Workers + D1 backed MCP context layer that every AI client can read and write.",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${raleway.variable}`}
      dir="ltr"
    >
      <body className="min-h-full">
        {children}
        {/*
          Inline JSON-LD: Next.js docs recommend dangerouslySetInnerHTML for
          structured data. Content here is fully derived from constants in
          this file via JSON.stringify — no user input, no XSS surface.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
