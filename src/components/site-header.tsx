"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { markNavPending } from "@/lib/hard-nav";

/**
 * Public site navbar. Lifted unchanged from the landing page header so the
 * public routes (/, /about, /contact) share one identical bar.
 *
 * It deliberately does not read the session: the public bar always shows the
 * same Login / Sign Up actions, so the first paint can never flip once the
 * client restores a stored session from localStorage.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          prefetch
          onClick={() => markNavPending()}
          className="shrink-0"
        >
          <BrandLogo compact byline={null} />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-[#374151] md:flex">
          <Link
            href="/"
            prefetch
            onClick={() => markNavPending()}
            className="hover:text-[#24A148]"
          >
            Home
          </Link>
          <Link
            href="/about"
            prefetch
            onClick={() => markNavPending()}
            className="hover:text-[#24A148]"
          >
            About Us
          </Link>
          <Link
            href="/contact"
            prefetch
            onClick={() => markNavPending()}
            className="hover:text-[#24A148]"
          >
            Contact Us
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            prefetch
            onClick={() => markNavPending()}
            className="hidden h-10 items-center rounded-xl px-3 text-sm font-semibold text-[#121417] hover:bg-[#F3F5F4] sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/register"
            prefetch
            onClick={() => markNavPending()}
            className="inline-flex h-10 items-center rounded-xl bg-[#24A148] px-4 text-sm font-semibold text-white hover:bg-[#1e8a3c]"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
}
