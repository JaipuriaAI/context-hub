/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { useCases } from "./content";

/**
 * Per-route OG card for each /use-cases/<slug> page.
 *
 * Why: per-route OG cards drive 35–60% higher CTR than a shared image
 * across social platforms (LinkedIn, Slack, Reddit) per the May 2026
 * citation-research benchmarks. Each card surfaces the route's specific
 * value prop — kicker (Workflow / Infrastructure / Multi-client),
 * headline, and the install pill — using the brand's rainbow stripes
 * top + bottom and the wordmark with rainbow underline.
 *
 * Generation strategy: static at build time. `generateImageMetadata` +
 * `generateStaticParams` ensure all 3 cards prerender as PNG assets and
 * ship to Vercel's edge CDN. No per-request rendering cost.
 *
 * Composition matches the homepage OG so brand recognition is preserved
 * across thumbnails — only the headline + kicker change per route.
 */

export const alt = "Context Hub — use-case overview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RAINBOW =
  "linear-gradient(90deg, #9677f8 0%, #4e44fd 34%, #ff4859 67%, #00c483 100%)";

/*
 * Static-params strategy:
 *
 * For dynamic OG image routes in Next 16, the simplest reliable path is
 * to export `generateStaticParams` from the sibling page.tsx (which we
 * already do) and a default-only OG image handler here. Next will call
 * this default function once per slug at build time.
 *
 * Avoid `generateImageMetadata` here unless you genuinely need multiple
 * variants per slug — its interaction with the metadata-route loader
 * causes either duplicate-export or empty-id failures depending on the
 * shape returned. The page.tsx generateStaticParams + this default
 * function is the cleaner contract.
 */

export default async function OpenGraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const useCase = useCases[params.slug];

  // Defensive fallback — generateStaticParams covers all known slugs but
  // keep this so any future slug renders a clean card instead of crashing.
  const headline = useCase?.title ?? "Context Hub";
  const kicker = useCase?.kicker ?? "Use case";
  const description =
    useCase?.description ??
    "One MCP context layer shared by every AI client you use.";

  // Trim long descriptions to 2 lines max at OG scale (~140 chars).
  const trimmedDescription =
    description.length > 140
      ? description.slice(0, 137).trimEnd() + "…"
      : description;

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "78px 96px",
        background:
          "radial-gradient(ellipse at 78% 6%, rgba(150,119,248,0.28), transparent 52%), radial-gradient(ellipse at 4% 94%, rgba(255,72,89,0.22), transparent 52%), #0a0a0a",
        color: "#ffffff",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
      }}
    >
      {/* Rainbow stripe — top edge */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: RAINBOW,
          display: "flex",
        }}
      />
      {/* Rainbow stripe — bottom edge */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: RAINBOW,
          display: "flex",
        }}
      />

      {/* Top row: brand wordmark + kicker pill */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        {/* Brand wordmark with rainbow underline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "30px",
              letterSpacing: "-0.012em",
            }}
          >
            <span
              style={{
                display: "flex",
                color: "#9677f8",
                fontWeight: 700,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              }}
            >
              &gt;_
            </span>
            <div style={{ display: "flex", color: "#ffffff" }}>
              <span style={{ display: "flex", fontWeight: 600 }}>Context</span>
              <span
                style={{
                  display: "flex",
                  fontWeight: 200,
                  marginLeft: "8px",
                }}
              >
                Hub
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              height: "2px",
              width: "230px",
              marginLeft: "44px",
              background: RAINBOW,
              borderRadius: "1px",
            }}
          />
        </div>

        {/* Kicker pill — uppercase, lavender, in a faint pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 22px",
            borderRadius: "9999px",
            border: "1.5px solid rgba(150,119,248,0.55)",
            background: "rgba(150,119,248,0.08)",
            color: "#9677f8",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </div>
      </div>

      {/* Headline + description block */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "26px",
          maxWidth: "1000px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "78px",
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.025em",
            color: "#ffffff",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "26px",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.4,
            maxWidth: "920px",
            fontWeight: 400,
            letterSpacing: "-0.005em",
          }}
        >
          {trimmedDescription}
        </div>
      </div>

      {/* Trust line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          fontSize: "22px",
          color: "rgba(255,255,255,0.78)",
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#00c483",
            boxShadow: "0 0 14px rgba(0,196,131,0.7)",
          }}
        />
        <span style={{ display: "flex" }}>Free</span>
        <span style={{ display: "flex", color: "rgba(255,255,255,0.32)" }}>
          ·
        </span>
        <span style={{ display: "flex" }}>Open source</span>
        <span style={{ display: "flex", color: "rgba(255,255,255,0.32)" }}>
          ·
        </span>
        <span
          style={{
            display: "flex",
            color: "#9677f8",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
            fontWeight: 600,
          }}
        >
          npx create-context-hub
        </span>
      </div>
    </div>,
    { ...size },
  );
}
