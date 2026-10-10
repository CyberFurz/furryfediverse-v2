import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBluesky } from "@fortawesome/free-brands-svg-icons";

/** Card surface classes for bridged Bluesky accounts (vs. native fediverse). */
export const BLUESKY_CARD_CLASSES = "bg-[#1185fe]/10 border-[#1185fe]/40 hover:border-[#1185fe]/60";

/** Small avatar overlay marking an account as bridged from Bluesky. */
export function BlueskyAvatarBadge() {
  return (
    <span
      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1185fe] ring-2 ring-[#12384b] flex items-center justify-center"
      title="Bridged from Bluesky"
    >
      <FontAwesomeIcon icon={faBluesky} className="w-3 h-3 text-white" />
    </span>
  );
}

/** Inline label: "Bluesky (bridged)". */
export function BlueskyLabel() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1185fe]/20 text-[#6bb5ff] text-[10px] font-semibold uppercase tracking-wide shrink-0"
      title="This account lives on Bluesky and is bridged to the fediverse via Bridgy Fed"
    >
      <FontAwesomeIcon icon={faBluesky} className="w-2.5 h-2.5" />
      Bluesky
    </span>
  );
}
