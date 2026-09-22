"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { FieldCrew, GeoPoint, MasterIncident, User } from "@/lib/types";
import { distanceMetres, etaMinutes, formatKm } from "@/lib/geo";
import { bindPageScrollFriendlyMap } from "@/lib/leaflet-mobile";

export function TrackLiveMap({
  incident,
  crew,
  technicianName,
  perspective = "resident",
  mapClassName,
}: {
  incident: MasterIncident;
  crew: FieldCrew;
  technicianName: string;
  perspective?: "resident" | "technician";
  mapClassName?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  const remaining = distanceMetres(crew.location, incident.location);
  const eta = etaMinutes(remaining);
  const arrived = remaining < 90 || crew.status === "on_site";

  const signature = useMemo(
    () =>
      JSON.stringify({
        van: crew.location,
        house: incident.location,
        status: crew.status,
      }),
    [crew.location, incident.location, crew.status],
  );

  useEffect(() => {
    let cancelled = false;
    const el = elRef.current;
    if (!el) return;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !el) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      delete (el as HTMLDivElement & { _leaflet_id?: number })._leaflet_id;

      const map = L.map(el, {
        zoomControl: true,
        attributionControl: true,
      }).setView([incident.location.lat, incident.location.lon], 14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        className: "electroraid-basemap",
      }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      const unbindTouch = bindPageScrollFriendlyMap(map, el);
      requestAnimationFrame(() => map.invalidateSize());
      setReady(true);
      return unbindTouch;
    }

    let unbindTouch: (() => void) | undefined;
    mount().then((cleanup) => {
      if (cancelled) {
        cleanup?.();
        return;
      }
      unbindTouch = cleanup;
    });
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => {
      cancelled = true;
      unbindTouch?.();
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !mapRef.current || !layersRef.current) return;
      const group = layersRef.current;
      const map = mapRef.current;
      group.clearLayers();

      const house: [number, number] = [incident.location.lat, incident.location.lon];
      const van: [number, number] = [crew.location.lat, crew.location.lon];

      group.addLayer(
        L.polyline([van, house], {
          color: "#24A148",
          weight: 4,
          dashArray: "8 10",
          opacity: 0.9,
        }),
      );

      const houseIcon = L.divIcon({
        className: "",
        html:
          perspective === "technician"
            ? `<div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:18px;height:18px;border-radius:4px;background:#e24b4b;border:2px solid #fff;box-shadow:0 0 10px #e24b4b"></div>
          <div style="margin-top:3px;font:11px/1 ui-sans-serif;color:#fff;background:#e24b4b;padding:2px 6px;border-radius:99px;font-weight:700;white-space:nowrap">Job</div>
        </div>`
            : `<div style="width:18px;height:18px;border-radius:4px;background:#e24b4b;border:2px solid #fff;box-shadow:0 0 10px #e24b4b"></div>`,
        iconSize: perspective === "technician" ? [72, 36] : [18, 18],
        iconAnchor: perspective === "technician" ? [36, 10] : [9, 9],
      });
      group.addLayer(
        L.marker(house, { icon: houseIcon }).bindTooltip(
          perspective === "technician" ? "Job destination" : "Your house / meter",
        ),
      );

      const vanIcon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:16px;height:16px;border-radius:99px;background:#24A148;border:2px solid #fff;box-shadow:0 0 14px #24A148"></div>
          <div style="margin-top:3px;font:11px/1 ui-sans-serif;color:#fff;background:#24A148;padding:2px 6px;border-radius:99px;font-weight:700;white-space:nowrap">${
            perspective === "technician" ? "You" : "Tech"
          }</div>
        </div>`,
        iconSize: [72, 36],
        iconAnchor: [36, 10],
      });
      group.addLayer(
        L.marker(van, { icon: vanIcon }).bindTooltip(
          perspective === "technician"
            ? `You · ${crew.callsign}`
            : `${technicianName} · ${crew.callsign}`,
        ),
      );

      map.fitBounds(L.latLngBounds([van, house]).pad(0.35));
    });
    return () => {
      active = false;
    };
  }, [
    signature,
    incident.location,
    crew.location,
    crew.callsign,
    technicianName,
    ready,
    perspective,
  ]);

  const maps = navigateUrl(crew.location, incident.location);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      <div
        ref={elRef}
        className={mapClassName ?? "h-52 w-full sm:h-64 md:h-80"}
        style={{ minHeight: 208 }}
      />
      <div className="flex items-start justify-between gap-3 bg-white px-3 py-2">
        <div>
          <div className="text-[10px] tracking-wide text-primary uppercase">
            {perspective === "technician"
              ? arrived
                ? "You are at the meter"
                : "Route to the job"
              : arrived
                ? "Technician at your meter"
                : "Live technician tracking"}
          </div>
          <div className="text-sm font-medium">
            {perspective === "technician"
              ? incident.address
              : `${technicianName} · ${crew.callsign}`}
          </div>
          <div className="text-muted-foreground text-xs">
            {perspective === "technician"
              ? `${crew.callsign} · ${crew.vehicleReg}`
              : `${crew.vehicleReg} · ${crew.status.replaceAll("_", " ")}`}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-semibold text-primary">
            {arrived ? "Now" : `${eta} min`}
          </div>
          <div className="text-muted-foreground text-[11px]">
            {arrived ? "Arrived" : formatKm(remaining)}
          </div>
        </div>
      </div>
      {perspective === "technician" ? (
        <a
          href={maps}
          target="_blank"
          rel="noreferrer"
          className="bg-primary text-primary-foreground block px-3 py-2.5 text-center text-sm font-medium"
        >
          {arrived ? "Open job pin in Maps" : "Navigate to this job"}
        </a>
      ) : null}
    </div>
  );
}

export function navigateUrl(from: GeoPoint, to: GeoPoint) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=driving`;
}

export function technicianNameForCrew(crew: FieldCrew, users: User[]): string {
  return users.find((u) => u.id === crew.userId)?.fullName ?? crew.callsign;
}

export function remainingTo(crew: FieldCrew, point: GeoPoint) {
  return distanceMetres(crew.location, point);
}
