import { useState } from "react";
import { useT } from "../i18n";

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
      <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
    </svg>
  );
}

// Web Share API where available (mobile browsers, mostly), copy-to-clipboard
// fallback everywhere else. `url` is always public content — the recipe page
// is public at Basic tier, and meal-plan share links are public by design.
export default function ShareButton({ url, title, variant = "icon", className }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can offer
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={handleShare}
        aria-label={copied ? t("link_copied") : t("share")}
        title={t("share")}
        className={className || "shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center"}
        style={{ borderColor: "var(--line)", color: "var(--muted)" }}
      >
        {copied ? <span aria-hidden="true">✓</span> : <ShareIcon />}
      </button>
    );
  }

  return (
    <button onClick={handleShare} className={className || "btn-ghost"}>
      {copied ? t("link_copied") : t("share_link")}
    </button>
  );
}
