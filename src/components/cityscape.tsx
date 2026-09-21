"use client";

import { cn } from "@/lib/utils";

const LOCAL_HERO = "/tshwane-hero.jpg";
const WIKI_HERO =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Union_Buildings_Pretoria_01.jpg/1920px-Union_Buildings_Pretoria_01.jpg";

export function CityscapeBackdrop({
  children,
  dim = true,
  className,
  src = LOCAL_HERO,
  alt = "Union Buildings, Pretoria — City of Tshwane",
}: {
  children: React.ReactNode;
  dim?: boolean;
  className?: string;
  /** Background image to stretch over the backdrop. Defaults to the bundled Tshwane hero. */
  src?: string;
  alt?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-[#1a1f1c]", className ?? "min-h-dvh")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = WIKI_HERO;
        }}
      />
      {dim ? <div className="hero-scrim absolute inset-0" /> : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
