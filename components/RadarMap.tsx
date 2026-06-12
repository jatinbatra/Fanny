"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as LeafletMap, LayerGroup, Marker, Circle } from "leaflet";
import { Flight, TurbulenceEvent, TurbulenceSeverity } from "@/lib/types";

interface Props {
  flights: Flight[];
  turbulenceZones: TurbulenceEvent[];
  trackedFlights: string[];
  onFlightSelect: (flight: Flight | null) => void;
  selectedFlight: Flight | null;
}

const SEVERITY_COLORS: Record<TurbulenceSeverity, string> = {
  light: "#ffc800",
  moderate: "#ff8c00",
  severe: "#ff3366",
  extreme: "#ff0044",
};

const SEVERITY_OPACITY: Record<TurbulenceSeverity, number> = {
  light: 0.15,
  moderate: 0.22,
  severe: 0.3,
  extreme: 0.45,
};

export default function RadarMap({
  flights,
  turbulenceZones,
  trackedFlights,
  onFlightSelect,
  selectedFlight,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const flightLayerRef = useRef<LayerGroup | null>(null);
  const turbLayerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let L: typeof import("leaflet");

    async function initMap() {
      L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const map = L.map(containerRef.current!, {
        center: [30, 0],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control
        .attribution({ prefix: "© OpenStreetMap | CartoDB | OpenSky" })
        .addTo(map);

      flightLayerRef.current = L.layerGroup().addTo(map);
      turbLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    }

    initMap();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render turbulence zones
  useEffect(() => {
    if (!mapReady || !turbLayerRef.current) return;

    async function renderTurb() {
      const L = (await import("leaflet")).default;
      turbLayerRef.current!.clearLayers();

      for (const zone of turbulenceZones) {
        const radiusMeters = zone.radiusNm * 1852;
        const color = SEVERITY_COLORS[zone.severity];
        const opacity = SEVERITY_OPACITY[zone.severity];

        // Outer glow
        L.circle([zone.lat, zone.lon], {
          radius: radiusMeters * 1.3,
          color,
          fillColor: color,
          fillOpacity: opacity * 0.3,
          opacity: 0,
          weight: 0,
        }).addTo(turbLayerRef.current!);

        // Main zone
        const circle = L.circle([zone.lat, zone.lon], {
          radius: radiusMeters,
          color,
          fillColor: color,
          fillOpacity: opacity,
          opacity: 0.7,
          weight: 1.5,
          dashArray: zone.source === "SIMULATED" ? "6 4" : undefined,
        }).addTo(turbLayerRef.current!);

        const durText = zone.durationMinutes
          ? `~${zone.durationMinutes} min`
          : "ongoing";
        const ageMin = Math.round((Date.now() - zone.startTime) / 60000);

        circle.bindTooltip(
          `<div style="font-family:monospace;font-size:11px;line-height:1.6">
            <b style="color:${color}">${zone.severity.toUpperCase()} TURBULENCE</b><br/>
            Alt: FL${Math.round(zone.altitudeFt / 100)}<br/>
            Radius: ${zone.radiusNm}nm<br/>
            Duration: ${durText}<br/>
            Age: ${ageMin}m ago<br/>
            Source: ${zone.source}
            ${zone.rawText ? `<br/><span style="color:#94a3b8">${zone.rawText.slice(0, 60)}</span>` : ""}
          </div>`,
          { sticky: true, className: "leaflet-dark-tooltip" }
        );
      }
    }

    renderTurb();
  }, [mapReady, turbulenceZones]);

  // Render flights
  useEffect(() => {
    if (!mapReady || !flightLayerRef.current) return;

    async function renderFlights() {
      const L = (await import("leaflet")).default;

      for (const flight of flights) {
        const isTracked = trackedFlights.includes(flight.icao24);
        const inTurb = !!flight.turbulence;
        const isSelected = selectedFlight?.icao24 === flight.icao24;
        const color = inTurb
          ? SEVERITY_COLORS[flight.turbulence!.severity]
          : isTracked
          ? "#00d4ff"
          : "#4a7fa5";

        const size = isSelected ? 14 : isTracked ? 11 : inTurb ? 10 : 7;

        const icon = L.divIcon({
          className: "",
          iconSize: [size * 2, size * 2],
          iconAnchor: [size, size],
          html: `<div style="
            width:${size * 2}px;height:${size * 2}px;
            display:flex;align-items:center;justify-content:center;
            position:relative;
          ">
            ${
              inTurb
                ? `<div style="
                position:absolute;width:${size * 2}px;height:${size * 2}px;
                border-radius:50%;border:2px solid ${color};
                opacity:0.6;animation:pulse-ring 1.5s ease-out infinite;
              "></div>`
                : ""
            }
            <div style="
              font-size:${size}px;
              transform:rotate(${flight.trueTrack}deg);
              filter:drop-shadow(0 0 ${inTurb ? 4 : 2}px ${color});
              color:${color};
              line-height:1;
            ">✈</div>
          </div>`,
        });

        const altFt = Math.round(flight.altitude * 3.28084);
        const speedKts = Math.round(flight.velocity * 1.94384);
        const turbInfo = flight.turbulence
          ? `<br/><b style="color:${color}">⚠ ${flight.turbulence.severity.toUpperCase()} TURBULENCE</b>`
          : "";
        const popupHtml = `<div style="font-family:monospace;font-size:12px;line-height:1.8;min-width:180px">
            <b style="color:#00d4ff;font-size:14px">${flight.callsign}</b>
            <span style="color:#64748b;font-size:10px"> ${flight.icao24}</span>
            ${turbInfo}
            <hr style="border-color:#1e2d4a;margin:6px 0"/>
            <span style="color:#94a3b8">Origin:</span> ${flight.originCountry}<br/>
            <span style="color:#94a3b8">Altitude:</span> FL${Math.round(altFt / 100)}<br/>
            <span style="color:#94a3b8">Speed:</span> ${speedKts} kts<br/>
            <span style="color:#94a3b8">Heading:</span> ${Math.round(flight.trueTrack)}°<br/>
            <span style="color:#94a3b8">V/S:</span> ${Math.round(flight.verticalRate * 196.85)} ft/min
          </div>`;

        if (markersRef.current.has(flight.icao24)) {
          const existing = markersRef.current.get(flight.icao24)!;
          existing.setLatLng([flight.latitude, flight.longitude]);
          existing.setIcon(icon);
          existing.setPopupContent(popupHtml);
          existing.off("click");
          existing.on("click", () => onFlightSelect(flight));
        } else {
          const marker = L.marker([flight.latitude, flight.longitude], { icon });
          marker.bindPopup(popupHtml, { maxWidth: 240 });
          marker.on("click", () => onFlightSelect(flight));
          marker.addTo(flightLayerRef.current!);
          markersRef.current.set(flight.icao24, marker);
        }
      }

      // Remove stale markers
      for (const [icao, marker] of markersRef.current.entries()) {
        if (!flights.find((f) => f.icao24 === icao)) {
          marker.remove();
          markersRef.current.delete(icao);
        }
      }
    }

    renderFlights();
  }, [mapReady, flights, trackedFlights, selectedFlight, onFlightSelect]);

  // Pan to selected flight
  useEffect(() => {
    if (selectedFlight && mapRef.current) {
      mapRef.current.setView(
        [selectedFlight.latitude, selectedFlight.longitude],
        Math.max(mapRef.current.getZoom(), 6),
        { animate: true }
      );
    }
  }, [selectedFlight]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-10 left-3 z-[1000] bg-[#0d1525cc] border border-[#1e2d4a] rounded-lg p-3 text-xs font-mono backdrop-blur-sm">
        <div className="text-[#94a3b8] mb-2 uppercase tracking-wider text-[10px]">Turbulence</div>
        {(["light", "moderate", "severe", "extreme"] as TurbulenceSeverity[]).map((s) => (
          <div key={s} className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full border"
              style={{ background: SEVERITY_COLORS[s] + "44", borderColor: SEVERITY_COLORS[s] }}
            />
            <span style={{ color: SEVERITY_COLORS[s] }}>{s}</span>
          </div>
        ))}
        <hr className="border-[#1e2d4a] my-2" />
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color: "#00d4ff" }}>✈</span>
          <span className="text-slate-400">tracked</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "#4a7fa5" }}>✈</span>
          <span className="text-slate-400">normal</span>
        </div>
      </div>
    </div>
  );
}
