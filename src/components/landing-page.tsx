"use client";

import { BrandLogo } from "@/components/brand-logo";
import { CityscapeBackdrop } from "@/components/cityscape";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/lib/use-session";
import { go } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";
import unionBuildingHero from "@/Assets/Image/Union-Building-LandingPage.jpeg";

export function LandingPage() {
  const { persona, ready } = useSession();
  const signedIn = Boolean(ready && persona);
  const reportPath =
    persona?.role === "resident" ? "/resident/report" : (persona?.home ?? "/resident/report");
  const trackPath =
    persona?.role === "resident" ? "/resident/track" : (persona?.home ?? "/resident/track");

  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />

      <CityscapeBackdrop
        dim={false}
        src={unionBuildingHero.src}
        alt="Union Buildings, Pretoria — City of Tshwane"
        className="min-h-[72vh] md:min-h-[78vh]"
      >
        <div className="hero-scrim relative flex min-h-[72vh] flex-col items-center justify-center px-4 py-20 text-center md:min-h-[78vh]">
          <p className="text-xs font-semibold tracking-[0.28em] text-white/80 uppercase">
            City of Tshwane Electricity
          </p>
          <h1 className="font-heading mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-7xl">
            Report. Track. Restore.
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/85 md:text-lg">
            Log a power fault in seconds, watch the assigned technician drive to
            your meter, and confirm when the lights are back.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() =>
                go(signedIn ? reportPath : "/login?next=/resident/report")
              }
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl bg-[#24A148] px-8 text-base font-semibold text-white shadow-lg shadow-black/20 hover:bg-[#1e8a3c]"
            >
              Report
            </button>
            <button
              type="button"
              onClick={() =>
                go(signedIn ? trackPath : "/login?next=/resident/track")
              }
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl border-2 border-white bg-transparent px-8 text-base font-semibold text-white hover:bg-white/10"
            >
              Track Report
            </button>
          </div>
        </div>
      </CityscapeBackdrop>

      <section id="how" className="bg-[#F7F8F7] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-heading text-2xl font-bold text-[#121417] md:text-3xl">
            Municipal service, in one place
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6B7280] md:text-base">
            ElectroRaid is how Tshwane households report outages, how control room
            assigns a crew, and how you see that van moving toward your street.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Report the fault",
                body: "No power, a cable down, a sparking pole, or an anonymous Izinyoka tip. Your municipal account links the ticket to your meter.",
              },
              {
                step: "02",
                title: "Track the technician",
                body: "The moment dispatch assigns a crew, you see the van, the callsign, and a live ETA — the same way you track a ride.",
              },
              {
                step: "03",
                title: "Confirm restoration",
                body: "When the technician signs off, you confirm the lights are back or dispute if they are not. The ticket does not close without you.",
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
                <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
                  {item.body}
                </p>
              </div>
            ))}
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
