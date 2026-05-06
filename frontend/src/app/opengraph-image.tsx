/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

// Node runtime (no `runtime = "edge"`) lets Next static-generate this image
// at build time, so it ships as a real PNG asset instead of being rendered
// per-request. WhatsApp / X / LinkedIn scrapers fetch this URL directly.
export const alt =
  "Context Hub — Stop re-explaining yourself to every AI tool. One context layer. Every AI client.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RAINBOW =
  "linear-gradient(90deg, #9677f8 0%, #4e44fd 34%, #ff4859 67%, #00c483 100%)";

/**
 * Static OG card — Rehearsal-faithful brand composition.
 *
 * Design intent:
 *   - 70% headline-dominated layout (matches tryrehearsal.ai hero)
 *   - Pure #0a0a0a canvas, soft lavender/coral ambient blobs, no grid clutter
 *   - Wordmark (top-left) sits above its own rainbow underline — Rehearsal's
 *     signature trick, mirrored here as Context(600) + Hub(200)
 *   - One headline keyword ("everywhere") in coral; Satori can't render
 *     `background-clip: text` so the rainbow is reserved for stripes/borders
 *   - Rainbow stripes top + bottom frame the card so the brand reads in 1s
 *     even at WhatsApp's ~400px thumbnail
 *   - Trust line ("Free · Open source · MIT") replaces the noisy install pill
 *     — at 400px scale a code snippet becomes illegible, a trust line stays
 *     parseable
 */
export default async function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "78px 96px",
        // Pure black canvas + two ambient gradient blobs (lavender top-right,
        // coral bottom-left). Matches the Rehearsal hero atmosphere.
        background:
          "radial-gradient(ellipse at 78% 6%, rgba(150,119,248,0.28), transparent 52%), radial-gradient(ellipse at 4% 94%, rgba(255,72,89,0.22), transparent 52%), #0a0a0a",
        color: "#ffffff",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
      }}
    >
      {/* Rainbow stripe — top edge (Rehearsal brand rule). */}
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

      {/* Rainbow stripe — bottom edge. Frames the card so the brand reads
            even at 400px thumbnail in WhatsApp/Slack/Discord previews. */}
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

      {/* Brand wordmark with rainbow underline.
            Composition: prompt-glyph (>_) in lavender, "Context"(600) +
            "Hub"(200) in white, 2px rainbow underline directly below —
            Rehearsal's signature wordmark trick adapted for Context Hub. */}
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
            fontSize: "34px",
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
              style={{ display: "flex", fontWeight: 200, marginLeft: "8px" }}
            >
              Hub
            </span>
          </div>
        </div>
        {/* Rainbow underline — 2px, full width of the wordmark text. */}
        <div
          style={{
            display: "flex",
            height: "2px",
            width: "260px",
            marginLeft: "50px",
            background: RAINBOW,
            borderRadius: "1px",
          }}
        />
      </div>

      {/* Headline block — 60% of the canvas, max-width caps line length
            to ~50ch which reads cleanly at thumbnail scale. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          maxWidth: "1000px",
        }}
      >
        <div
          style={{
            fontSize: "104px",
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            color: "#ffffff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ display: "flex" }}>Stop re-explaining</span>
          <span style={{ display: "flex" }}>
            yourself to every{" "}
            <span
              style={{
                display: "flex",
                color: "#ff4859",
                marginLeft: "26px",
                fontWeight: 700,
              }}
            >
              AI tool.
            </span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "32px",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.4,
            maxWidth: "880px",
            fontWeight: 400,
            letterSpacing: "-0.005em",
          }}
        >
          One shared context layer for Claude, ChatGPT, Cursor, Perplexity, and
          Claude Code.
        </div>
      </div>

      {/* Trust line — replaces the noisy install pill. At thumbnail scale
            (~400px wide) a code snippet is unreadable, but a 4-token trust
            line still parses. Green dot + plain words + lavender domain. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          fontSize: "24px",
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
        <span style={{ display: "flex" }}>MIT licensed</span>
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
