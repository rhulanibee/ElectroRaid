"use client";

import { SiteHeader } from "@/components/site-header";
import { BrandLogo } from "@/components/brand-logo";
import { go } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";

export default function ContactPage() {
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />

      <section className="bg-[#F7F8F7] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-heading text-2xl font-bold text-[#121417] md:text-3xl">
            Contact Us
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6B7280] md:text-base">
            ElectroRaid is a City of Tshwane outage and revenue-protection
            prototype, so every channel below runs inside the app and writes to
            the same audit chain.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Residents",
                body: "Report a fault or an anonymous tip, track the assigned technician, and confirm restoration from your dashboard.",
                cta: "Report an outage",
                href: "/login?next=/resident/report",
              },
              {
                step: "02",
                title: "Municipal staff",
                body: "Control room, field technicians and revenue investigators sign in with their municipal credentials.",
                cta: "Staff login",
                href: "/login?staff=1",
              },
              {
                step: "03",
                title: "Audit & disputes",
                body: "Query a zero-consumption audit, a closure photo, or a simulated fine, and raise a dispute against the ticket.",
                cta: "Revenue investigations",
                href: "/login?next=/inspect",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className={cn(
                  "flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm",
                  i === 1 && "md:-translate-y-1",
                )}
              >
                <div className="text-xs font-bold tracking-[0.2em] text-[#24A148] uppercase">
                  {item.step}
                </div>
                <h3 className="font-heading mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{item.body}</p>
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#24A148] px-4 text-sm font-semibold text-white hover:bg-[#1e8a3c]"
                >
                  {item.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-sm text-[#6B7280]">
            Account numbers and vending records in this prototype are
            representative test data, not live City of Tshwane CIS records.
          </p>
          <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => go("/")}
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl bg-[#24A148] px-8 text-base font-semibold text-white shadow-lg shadow-black/20 hover:bg-[#1e8a3c]"
            >
              Back to home
            </button>
            <button
              type="button"
              onClick={() => go("/about")}
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl border-2 border-[#24A148] bg-transparent px-8 text-base font-semibold text-[#24A148] hover:bg-[#24A148]/10"
            >
              About Us
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E5E7EB] bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 text-sm text-[#6B7280] md:flex-row md:items-center">
          <BrandLogo compact byline="Energy operations" />
          <div>City of Tshwane · ElectroRaid outage operations</div>
        </div>
      </footer>
    </div>
  );
}
