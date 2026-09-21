"use client";

import { SiteHeader } from "@/components/site-header";
import { BrandLogo } from "@/components/brand-logo";
import { go } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />

      <section className="bg-[#F7F8F7] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-heading text-2xl font-bold text-[#121417] md:text-3xl">
            About Us
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6B7280] md:text-base">
            ElectroRaid is the municipal outage and revenue-protection platform for
            the City of Tshwane. It sits between residents, control-room
            dispatchers, field technicians, and revenue-protection inspectors.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Residents",
                body: "Report no power, a cable down, a sparking pole, or an anonymous Izinyoka tip against your municipal account.",
              },
              {
                step: "02",
                title: "Municipal teams",
                body: "Duplicate reports cluster in real time, the right crew is matched and dispatched, and every action is written to an audit chain.",
              },
              {
                step: "03",
                title: "Accountability",
                body: "Meters that stop buying electricity while the feeder is live are flagged, and a ticket only closes once you confirm restoration.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className={cn(
                  "rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm",
                  i === 1 && "md:-translate-y-1",
                )}
              >
                <div className="text-xs font-bold tracking-[0.2em] text-[#24A148] uppercase">
                  {item.step}
                </div>
                <h3 className="font-heading mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{item.body}</p>
              </div>
            ))}
          </div>
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
              onClick={() => go("/contact")}
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl border-2 border-[#24A148] bg-transparent px-8 text-base font-semibold text-[#24A148] hover:bg-[#24A148]/10"
            >
              Contact Us
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
