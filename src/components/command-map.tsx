"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { FieldCrew, MasterIncident, RevenueInvestigation } from "@/lib/types";
import { priorityBand } from "@/lib/engines/priority";
import { DEDUP_RADIUS_M } from "@/lib/types";

const TSHWANE: [number, number] = [-25.746, 28.229];

function bandColor(score: number) {
  const band = priorityBand(score);
  if (band === "critical") return "#e24b4b";
  if (band === "high") return "#f0a202";
  if (band === "medium") return "#3dd6a0";
  return "#7aa0b3";
}

interface CommandMapProps {
  incidents: MasterIncident[];
  investigations: RevenueInvestigation[];
  crews: FieldCrew[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showInvestigations?: boolean;
  className?: string;
}

export function CommandMap({
  incidents,
  investigations,
  crews,
  selectedId,
  onSelect,
  showInvestigations = true,
  className,
}: CommandMapProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [mapReady, setMapReady] = useState(false);

  const signature = useMemo(
    () =>
      JSON.stringify({
        incidents: incidents.map((i) => [
          i.id,
          i.status,
          i.location,
          i.affectedHouseholds,
          i.priorityScore,
        ]),
        investigations: investigations.map((i) => [
          i.id,
          i.status,
          i.location,
          i.anomalyRiskScore,
        ]),
        crews: crews.map((c) => [c.id, c.status, c.location]),
        selectedId,
      }),
    [incidents, investigations, crews, selectedId, showInvestigations],
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
        zoomControl: false,
        attributionControl: true,
      }).setView(TSHWANE, 11);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        className: "electroraid-basemap",
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
      setMapReady(true);
    }

    mount();
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Initial mount only — redraw is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !mapRef.current) return;
      const group = layersRef.current;
      if (!group) return;
      group.clearLayers();
      const map = mapRef.current;

      for (const incident of incidents) {
        const color = bandColor(incident.priorityScore);
        const open = incident.status !== "resolved" && incident.status !== "closed";
        const radius = 8 + Math.min(22, incident.affectedHouseholds * 0.35);
        const marker = L.circleMarker([incident.location.lat, incident.location.lon], {
          radius,
          color,
          weight: selectedId === incident.id ? 3 : 1.5,
          fillColor: color,
          fillOpacity: open ? 0.45 : 0.15,
        }).on("click", () => selectRef.current(incident.id));
        marker.bindTooltip(
          `<strong>${incident.reference}</strong><br/>${incident.suburb} · ${incident.affectedHouseholds} hh<br/>${incident.status.replaceAll("_", " ")}`,
        );
        group.addLayer(marker);
        if (selectedId === incident.id) {
          group.addLayer(
            L.circle([incident.location.lat, incident.location.lon], {
              radius: DEDUP_RADIUS_M,
              color: "#3dd6a0",
              weight: 1,
              dashArray: "4 6",
              fillColor: "#3dd6a0",
              fillOpacity: 0.06,
            }),
          );
        }
      }

      for (const inv of showInvestigations ? investigations : []) {
        if (inv.status === "closed_recovered" || inv.status === "closed_no_finding") continue;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:2px;background:#e4c35a;border:2px solid #1a1406;transform:rotate(45deg);box-shadow:0 0 12px #e4c35a"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        group.addLayer(
          L.marker([inv.location.lat, inv.location.lon], { icon })
            .on("click", () => selectRef.current(inv.id))
            .bindTooltip(
              `<strong>${inv.reference}</strong><br/>Inspector job · Risk ${inv.anomalyRiskScore}`,
            ),
        );
      }

      for (const crew of crews) {
        const color =
          crew.specialization === "revenue_protection" ? "#e4c35a" : "#5ec8ff";
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:10px;height:10px;border-radius:99px;background:${color};box-shadow:0 0 10px ${color}"></div>
            <div style="margin-top:2px;font:10px/1 ui-sans-serif;color:#d7efe6;background:#071016cc;padding:1px 4px;border-radius:4px;white-space:nowrap">${crew.specialization === "revenue_protection" ? "Inspector" : "Tech"} · ${crew.callsign.split(" ")[0]}</div>
          </div>`,
          iconSize: [80, 28],
          iconAnchor: [40, 8],
        });
        group.addLayer(
          L.marker([crew.location.lat, crew.location.lon], { icon }).bindTooltip(
            `${crew.specialization === "revenue_protection" ? "Inspector" : "Technician"} · ${crew.callsign} · ${crew.status.replaceAll("_", " ")}`,
          ),
        );
      }

      const selected =
        incidents.find((i) => i.id === selectedId) ??
        investigations.find((i) => i.id === selectedId);
      if (selected && map) {
        map.flyTo([selected.location.lat, selected.location.lon], 14, {
          duration: 0.8,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [signature, incidents, investigations, crews, selectedId, mapReady, showInvestigations]);

  return (
    <div
      ref={elRef}
      className={className ?? "h-full min-h-[320px] w-full overflow-hidden rounded-none"}
    />
  );
}
