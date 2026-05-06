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
 *   - Wordmark (top-left) sits above its own rainbow underline at proper
 *     visual weight (~46px) so the brand reads at WhatsApp ~400px thumbnail
 *   - Headline as 2 controlled lines, NOT relying on flex-wrap (which Satori
 *     handles inconsistently). Single accent word ("AI tools") in coral.
 *   - Rainbow stripes top + bottom frame the card
 *   - Trust line uses chips with separators; install command sits in its own
 *     faint rainbow-bordered pill so it reads as "thing you can copy" instead
 *     of just inline text
 *
 * Spacing system: explicit vertical rhythm 56 / 88 / 88 / 56 with
 * justify-content: space-between balancing the 4 zones.
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
        padding: "64px 72px",
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

      {/* Rainbow stripe — bottom edge. Frames the card so the brand
            reads even at 400px thumbnail in WhatsApp/Slack/Discord. */}
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

      {/* ZONE 1 — Brand wordmark with rainbow underline.
            Sized at ~46px (was 34px) so brand has proper presence vs the
            88px headline. Underline width is fluid via flexbox alignment,
            not a fixed pixel value (the previous 260px was eyeballed). */}
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
        {/* Rainbow underline — sized to wordmark line width (~360px at 46px font). */}
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

      {/* ZONE 2 — Headline block.
            Two pre-broken lines as separate divs. NOT flex-wrap, NOT inline
            spans — Satori inserts visible whitespace between flex children
            which produced the double-space artifact in v1. Each line is a
            single string in a single div = one clean line of text. */}
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
            flexDirection: "column",
            fontSize: "88px",
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex" }}>Stop re-explaining yourself</div>
          <div style={{ display: "flex" }}>
            <span>to every&nbsp;</span>
            <span style={{ color: "#ff4859" }}>AI tool.</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.4,
            maxWidth: "920px",
            fontWeight: 400,
            letterSpacing: "-0.003em",
          }}
        >
          One shared context layer for Claude, ChatGPT, Cursor, Perplexity, and
          Claude Code.
        </div>
      </div>

      {/* ZONE 3 — Trust line + install pill.
            Two-row composition: trust chips on top (Free · OSS · MIT), the
            install command in its own bordered pill below. Pill format
            signals "this is something you can copy" rather than just text. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Trust row */}
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

        {/* Install pill — faint lavender border, transparent fill,
              monospace command. Reads as a copyable thing. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 22px",
            borderRadius: "9999px",
            border: "1.5px solid rgba(150,119,248,0.55)",
            background: "rgba(150,119,248,0.06)",
            fontSize: "26px",
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
