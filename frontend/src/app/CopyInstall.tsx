"use client";

import { useState } from "react";

type Variant = "hero" | "cta";

export function CopyInstall({
  command,
  variant = "hero",
}: {
  command: string;
  variant?: Variant;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = command;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* swallow — user can still highlight */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const containerClass = variant === "cta" ? "cta-install" : "install-command";

  return (
    <div
      id={variant === "hero" ? "install" : undefined}
      className={containerClass}
    >
      <span className={variant === "hero" ? "install-prompt" : undefined}>
        &gt;_
      </span>
      <code>{command}</code>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy install command"}
        aria-live="polite"
        className={variant === "hero" ? "install-copy" : "cta-install-copy"}
        onClick={handleCopy}
      >
        {copied ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
