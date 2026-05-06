/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { useCases } from "./content";

/**
 * Per-route OG card for each /use-cases/<slug> page.
 *
 * Why per-route: per-slug OG cards drive 35–60% higher CTR than a shared
 * image across LinkedIn / Slack / Reddit (May 2026 citation research).
 * Each card surfaces the route's specific value prop — kicker pill on the
 * top-right, full title as headline, description as supporting copy.
 *
 * Composition matches the homepage OG so brand recognition holds across
 * thumbnails — same wordmark scale, same rainbow stripes, same install
 * pill at the bottom. Only the headline text + kicker change per route.
 *
 * Spacing system: explicit 4-zone vertical rhythm
 * (wordmark+kicker / headline+description / trust+install) with
 * justify-content: space-between balancing gap distribution.
 *
 * Title sizing: scales DOWN as title length grows so longest titles
 * (e.g. "Own your AI memory before a vendor wipes it for you" — 51 chars)
 * still fit cleanly within 1056px maxWidth across 2-3 lines.
 */

export const alt = "Context Hub — use-case overview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RAINBOW =
  "linear-gradient(90deg, #9677f8 0%, #4e44fd 34%, #ff4859 67%, #00c483 100%)";

/**
 * Fluid title sizing — keeps the headline within bounds across all 4 use
 * cases. Calibrated for the longest title (51 chars). Standard rule:
 * shorter title = bigger font for impact, longer title = smaller for fit.
 */
function titleFontSize(titleLength: number): number {
  if (titleLength <= 35) return 84;
  if (titleLength <= 45) return 72;
  if (titleLength <= 55) return 64;
  return 58;
}

export default async function OpenGraphImage({
  params,
}: {
  // Next 16 metadata image routes pass `params` as a Promise. Awaiting it
  // is the difference between getting the slug (and rendering the per-route
  // card) vs getting `undefined.slug` and falling back to the generic card.
  // This was the codex review's #1 P1 finding — fixed.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const useCase = useCases[slug];

  // Defensive fallback — generateStaticParams covers known slugs but keep
  // this so any future slug renders cleanly instead of crashing.
  const headline = useCase?.title ?? "Context Hub";
  const kicker = useCase?.kicker ?? "Use case";
  const description =
    useCase?.description ??
    "One MCP context layer shared by every AI client you use.";

  // Trim long descriptions to ~2 lines at OG scale.
  const trimmedDescription =
    description.length > 150
      ? description.slice(0, 147).trimEnd() + "…"
      : description;

  const fontSize = titleFontSize(headline.length);

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
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

      {/* ZONE 1 — wordmark (left) + kicker pill (right). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        {/* Wordmark + rainbow underline. Sized to match homepage OG. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              fontSize: "46px",
              letterSpacing: "-0.015em",
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
                  marginLeft: "12px",
                }}
              >
                Hub
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              height: "3px",
              width: "360px",
              marginLeft: "66px",
              background: RAINBOW,
              borderRadius: "2px",
            }}
          />
        </div>

        {/* Kicker pill — uppercase, lavender border, faint fill. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 26px",
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

      {/* ZONE 2 — headline + description.
            Headline uses fluid font size based on title length. Single
            container with text content as a string (no nested spans) so
            Satori's wrap behavior stays clean. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          maxWidth: "1056px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: "-0.022em",
            color: "#ffffff",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.4,
            maxWidth: "960px",
            fontWeight: 400,
            letterSpacing: "-0.003em",
          }}
        >
          {trimmedDescription}
        </div>
      </div>

      {/* ZONE 3 — trust row + install pill (matches homepage). */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            fontSize: "22px",
            color: "rgba(255,255,255,0.78)",
            fontWeight: 500,
            letterSpacing: "-0.003em",
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
          <span style={{ display: "flex", color: "rgba(255,255,255,0.28)" }}>
            ·
          </span>
          <span style={{ display: "flex" }}>Open source</span>
          <span style={{ display: "flex", color: "rgba(255,255,255,0.28)" }}>
            ·
          </span>
          <span style={{ display: "flex" }}>MIT licensed</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "13px 22px",
            borderRadius: "9999px",
            border: "1.5px solid rgba(150,119,248,0.55)",
            background: "rgba(150,119,248,0.06)",
            fontSize: "24px",
            fontWeight: 600,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
            alignSelf: "flex-start",
          }}
        >
          <span style={{ display: "flex", color: "#9677f8" }}>$</span>
          <span style={{ display: "flex", color: "#ffffff" }}>
            npx create-context-hub
          </span>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
