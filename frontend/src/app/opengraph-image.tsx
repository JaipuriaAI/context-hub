/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

// Node runtime (no `runtime = "edge"`) lets Next static-generate this image
// at build time, so it ships as a real PNG asset instead of being rendered
// per-request.
export const alt =
  "Context Hub — your AI context, connected everywhere. One MCP layer, every AI client.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Static OG card rendered to PNG at build time via next/og.
 * Pure JSX — no external image generation, no raster assets, scales cleanly.
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
        padding: "72px 88px",
        background:
          "radial-gradient(ellipse at 75% 8%, rgba(85,216,231,0.22), transparent 55%), radial-gradient(ellipse at 5% 92%, rgba(246,162,26,0.16), transparent 55%), linear-gradient(135deg, #090d0f 0%, #0a1013 58%, #060a0c 100%)",
        color: "#f5f1e8",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        position: "relative",
      }}
    >
      {/* Subtle grid backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(216,247,232,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(216,247,232,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.5,
          display: "flex",
        }}
      />

      {/* Brand mark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          fontSize: "28px",
          fontWeight: 800,
          letterSpacing: "-0.005em",
          color: "#55d8e7",
        }}
      >
        <span style={{ display: "flex" }}>&gt;_</span>
        <span style={{ display: "flex", color: "#f5f1e8" }}>Context Hub</span>
      </div>

      {/* Headline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "26px",
        }}
      >
        <div
          style={{
            fontSize: "92px",
            fontWeight: 900,
            lineHeight: 1.04,
            letterSpacing: "-0.018em",
            color: "#f5f1e8",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ display: "flex" }}>Your AI context.</span>
          <span style={{ display: "flex" }}>
            Connected{" "}
            <span
              style={{
                display: "flex",
                color: "#55d8e7",
                marginLeft: "20px",
              }}
            >
              everywhere.
            </span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            color: "rgba(245,241,232,0.78)",
            lineHeight: 1.45,
            maxWidth: "880px",
          }}
        >
          One MCP context layer shared by Claude, ChatGPT, Cursor, Perplexity,
          Claude Code, and Codex.
        </div>
      </div>

      {/* Footer row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "40px",
          paddingTop: "28px",
          borderTop: "1px solid rgba(216,247,232,0.14)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: "26px",
            fontWeight: 700,
            color: "#55d8e7",
            padding: "16px 26px",
            border: "1px solid rgba(85,216,231,0.42)",
            borderRadius: "12px",
            background: "rgba(8,12,14,0.55)",
          }}
        >
          <span style={{ display: "flex" }}>&gt;_</span>
          <span style={{ display: "flex", color: "#f5f1e8" }}>
            npx create-context-hub
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "20px",
            color: "rgba(245,241,232,0.66)",
            fontWeight: 600,
          }}
        >
          <span
            style={{
              display: "flex",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#64dc7b",
            }}
          />
          <span style={{ display: "flex" }}>
            Free · Open source · MIT licensed
          </span>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
