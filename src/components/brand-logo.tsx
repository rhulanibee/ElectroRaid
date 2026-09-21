import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

type Tone = "brand" | "white";

/** Green house silhouette under a leafy arch — used on every branded surface. */
export function BrandMark({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: Tone;
}) {
  const fill = tone === "white" ? "#FFFFFF" : "#24A148";
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-10", className)}
      aria-hidden
      fill={fill}
    >
      <path d="M32 3.5c-1.2 0-2.2 1.2-1.6 2.6 1.4 3.4 1.8 6.2.6 9.2C22.2 14.6 14 22 14 33.5c0 1.3-1 2.3-2.3 2.3S9.4 34.8 9.4 33.5C9.4 19.6 19.2 9.2 30.2 7.2 28.6 5.4 29.6 3.5 32 3.5Z" />
      <path d="M32 3.5c2.4 0 3.4 1.9 1.8 3.7C44.8 9.2 54.6 19.6 54.6 33.5c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3C50 22 41.8 14.6 32.9 15.3c-1.2-3-.8-5.8.6-9.2C34.2 4.7 33.2 3.5 32 3.5Z" />
      <path d="M22.2 13.2c2.6-3.6 6-6.2 9.8-7.4-2 4.4-2.2 7.6-.4 11.2-3.8.2-7.4 1.8-10.2 4.4.2-3 0-5.6.8-8.2Z" />
      <path d="M41.8 13.2c-.8 2.6-1 5.2-.8 8.2-2.8-2.6-6.4-4.2-10.2-4.4 1.8-3.6 1.6-6.8-.4-11.2 3.8 1.2 7.2 3.8 9.8 7.4Z" />
      <path
        fillRule="evenodd"
        d="M32 21.2 13.8 36.6c-.7.6-.8 1.7-.2 2.4.6.7 1.7.8 2.4.2l1.3-1.1V53.8c0 1.3 1 2.4 2.4 2.4h7.1V44.2c0-1.3 1-2.3 2.3-2.3h5.8c1.3 0 2.3 1 2.3 2.3v12h7.1c1.4 0 2.4-1.1 2.4-2.4V38.1l1.3 1.1c.7.6 1.8.5 2.4-.2.6-.7.5-1.8-.2-2.4L32 21.2Zm-6.4 17.2c0 .9-.7 1.6-1.6 1.6h-2.4c-.9 0-1.6-.7-1.6-1.6v-2.4c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v2.4Zm17.2 0c0 .9-.7 1.6-1.6 1.6h-2.4c-.9 0-1.6-.7-1.6-1.6v-2.4c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v2.4Z"
      />
    </svg>
  );
}

export function BrandLogo({
  tone = "brand",
  stacked = false,
  compact = false,
  className,
  byline,
}: {
  tone?: Tone;
  stacked?: boolean;
  compact?: boolean;
  className?: string;
  byline?: string | null;
}) {
  const text = tone === "white" ? "text-white" : "text-[#121417]";
  const sub = tone === "white" ? "text-white/80" : "text-[#6B7280]";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        stacked && "flex-col gap-1.5 text-center",
        className,
      )}
    >
      <BrandMark
        tone={tone}
        className={compact ? "size-8" : stacked ? "size-12" : "size-10"}
      />
      <div className={cn(stacked && "leading-tight")}>
        <div
          className={cn(
            "font-heading font-bold tracking-tight",
            compact ? "text-base" : stacked ? "text-xl" : "text-lg",
            text,
          )}
        >
          {PRODUCT_NAME}
        </div>
        {byline !== null ? (
          <div className={cn("text-[10px] font-medium tracking-[0.16em] uppercase", sub)}>
            {byline ?? "City of Tshwane"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
