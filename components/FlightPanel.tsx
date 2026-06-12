"use client";

import { useState } from "react";
import { Flight, TurbulenceSeverity, TrackedFlight, TurbulenceEvent } from "@/lib/types";
import {
  Plane, AlertTriangle, Wind, Gauge, Navigation, Clock,
  Bell, BellOff, X, ChevronDown, ChevronUp, Zap
} from "lucide-react";

interface Props {
  turbulentFlights: Flight[];
  allTurbulenceZones: TurbulenceEvent[];
  trackedFlights: TrackedFlight[];
  onTrack: (flight: Flight) => void;
  onUntrack: (icao24: string) => void;
  onSelectFlight: (flight: Flight | null) => void;
  selectedFlight: Flight | null;
  dataSource: "live" | "mixed" | "simulated";
  flightCount: number;
  turbZoneCount: number;
}

const SEV_CLASS: Record<TurbulenceSeverity, string> = {
  light: "turb-light",
  moderate: "turb-moderate",
  severe: "turb-severe",
  extreme: "turb-extreme",
};

const SEV_ICON: Record<TurbulenceSeverity, string> = {
  light: "~",
  moderate: "≈",
  severe: "!",
  extreme: "!!",
};

function formatAge(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function formatDuration(zone: TurbulenceEvent) {
  if (!zone.durationMinutes) return "ongoing";
  const elapsedMin = (Date.now() - zone.startTime) / 60000;
  const remaining = zone.durationMinutes - elapsedMin;
  if (remaining <= 0) return "expiring";
  return `~${Math.round(remaining)}m left`;
}

export default function FlightPanel({
  turbulentFlights,
  allTurbulenceZones,
  trackedFlights,
  onTrack,
  onUntrack,
  onSelectFlight,
  selectedFlight,
  dataSource,
  flightCount,
  turbZoneCount,
}: Props) {
  const [tab, setTab] = useState<"turb" | "tracked" | "zones">("turb");
  const [expanded, setExpanded] = useState<string | null>(null);

  const isTracked = (icao24: string) =>
    trackedFlights.some((t) => t.icao24 === icao24);

  return (
    <div className="flex flex-col h-full bg-[#0d1525] border-l border-[#1e2d4a] font-mono">
      {/* Header stats */}
      <div className="px-4 py-3 border-b border-[#1e2d4a] bg-[#0a0e1a]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[#00ff88] text-xs uppercase tracking-widest">Live Radar</span>
          {dataSource !== "live" && (
            <span className="ml-auto text-[10px] text-amber-500 border border-amber-800 px-1.5 rounded">
              {dataSource === "simulated" ? "DEMO DATA" : "PARTIAL"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Flights" value={flightCount.toLocaleString()} color="#00d4ff" />
          <Stat label="In Turbulence" value={turbulentFlights.length} color="#ff8c00" />
          <Stat label="Turb Zones" value={turbZoneCount} color="#ff3366" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e2d4a]">
        {([
          ["turb", `Turbulent (${turbulentFlights.length})`],
          ["tracked", `Tracked (${trackedFlights.length})`],
          ["zones", `Zones (${turbZoneCount})`],
        ] as [string, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as "turb" | "tracked" | "zones")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider transition-colors ${
              tab === id
                ? "text-[#00d4ff] border-b-2 border-[#00d4ff] bg-[#00d4ff0a]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "turb" && (
          <div>
            {turbulentFlights.length === 0 ? (
              <Empty icon={<Wind size={24} />} text="No turbulent flights in view" />
            ) : (
              turbulentFlights.map((flight) => (
                <FlightCard
                  key={flight.icao24}
                  flight={flight}
                  isTracked={isTracked(flight.icao24)}
                  isSelected={selectedFlight?.icao24 === flight.icao24}
                  isExpanded={expanded === flight.icao24}
                  onExpand={() =>
                    setExpanded(expanded === flight.icao24 ? null : flight.icao24)
                  }
                  onSelect={() => onSelectFlight(flight)}
                  onTrack={() =>
                    isTracked(flight.icao24)
                      ? onUntrack(flight.icao24)
                      : onTrack(flight)
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === "tracked" && (
          <div>
            {trackedFlights.length === 0 ? (
              <Empty
                icon={<Bell size={24} />}
                text="No tracked flights. Click a flight then the bell icon to track it."
              />
            ) : (
              trackedFlights.map((tf) => {
                const live = turbulentFlights.find((f) => f.icao24 === tf.icao24);
                return (
                  <div
                    key={tf.icao24}
                    className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2d4a] hover:bg-[#00d4ff08] cursor-pointer transition-colors"
                    onClick={() => live && onSelectFlight(live)}
                  >
                    <Plane size={14} className="text-[#00d4ff] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#00d4ff]">{tf.callsign}</div>
                      <div className="text-[10px] text-slate-500">
                        Added {formatAge(tf.addedAt)}
                      </div>
                    </div>
                    {live?.turbulence && (
                      <span className={`text-[10px] px-2 py-0.5 rounded ${SEV_CLASS[live.turbulence.severity]}`}>
                        {live.turbulence.severity}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onUntrack(tf.icao24); }}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "zones" && (
          <div>
            {allTurbulenceZones.length === 0 ? (
              <Empty icon={<Zap size={24} />} text="No active turbulence zones" />
            ) : (
              allTurbulenceZones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected flight detail */}
      {selectedFlight && (
        <div className="border-t border-[#1e2d4a] bg-[#0a0e1a] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[#00d4ff] font-bold">{selectedFlight.callsign}</div>
              <div className="text-[10px] text-slate-500">{selectedFlight.icao24} · {selectedFlight.originCountry}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  isTracked(selectedFlight.icao24)
                    ? onUntrack(selectedFlight.icao24)
                    : onTrack(selectedFlight)
                }
                className={`p-2 rounded border transition-colors ${
                  isTracked(selectedFlight.icao24)
                    ? "border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff15]"
                    : "border-[#1e2d4a] text-slate-500 hover:border-[#00d4ff] hover:text-[#00d4ff]"
                }`}
                title={isTracked(selectedFlight.icao24) ? "Stop tracking" : "Track flight"}
              >
                {isTracked(selectedFlight.icao24) ? <Bell size={14} /> : <BellOff size={14} />}
              </button>
              <button
                onClick={() => onSelectFlight(null)}
                className="p-2 rounded border border-[#1e2d4a] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetricRow icon={<Gauge size={10} />} label="Altitude" value={`FL${Math.round(selectedFlight.altitude * 3.28084 / 100)}`} />
            <MetricRow icon={<Wind size={10} />} label="Speed" value={`${Math.round(selectedFlight.velocity * 1.94384)} kts`} />
            <MetricRow icon={<Navigation size={10} />} label="Heading" value={`${Math.round(selectedFlight.trueTrack)}°`} />
            <MetricRow icon={<Clock size={10} />} label="V/Rate" value={`${Math.round(selectedFlight.verticalRate * 196.85)} fpm`} />
          </div>

          {selectedFlight.turbulence && (
            <div className={`mt-3 p-2 rounded text-xs ${SEV_CLASS[selectedFlight.turbulence.severity]}`}>
              <div className="flex items-center gap-1 font-bold mb-1">
                <AlertTriangle size={10} />
                {selectedFlight.turbulence.severity.toUpperCase()} TURBULENCE
              </div>
              <div className="text-[10px] opacity-80">
                Duration: {formatDuration(selectedFlight.turbulence)}<br />
                Source: {selectedFlight.turbulence.source}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-slate-600 text-center">
      <div className="mb-3 opacity-40">{icon}</div>
      <div className="text-xs">{text}</div>
    </div>
  );
}

function MetricRow({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-slate-400">
      <span className="text-slate-600">{icon}</span>
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function FlightCard({
  flight, isTracked, isSelected, isExpanded, onExpand, onSelect, onTrack,
}: {
  flight: Flight;
  isTracked: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onSelect: () => void;
  onTrack: () => void;
}) {
  const turb = flight.turbulence!;
  const altFt = Math.round(flight.altitude * 3.28084);

  return (
    <div
      className={`border-b border-[#1e2d4a] transition-colors ${
        isSelected ? "bg-[#00d4ff0a]" : "hover:bg-[#ffffff04]"
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onSelect}
      >
        <div className={`text-sm font-bold px-1.5 py-0.5 rounded ${SEV_CLASS[turb.severity]}`}>
          {SEV_ICON[turb.severity]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-200 font-semibold">{flight.callsign}</span>
            {isTracked && <Bell size={10} className="text-[#00d4ff]" />}
          </div>
          <div className="text-[10px] text-slate-500">
            FL{Math.round(altFt / 100)} · {formatDuration(turb)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onTrack(); }}
            className="p-1 text-slate-600 hover:text-[#00d4ff] transition-colors"
          >
            {isTracked ? <Bell size={12} className="text-[#00d4ff]" /> : <BellOff size={12} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 text-[11px] text-slate-400 space-y-1 border-t border-[#1e2d4a] pt-2">
          <div>Speed: {Math.round(flight.velocity * 1.94384)} kts</div>
          <div>Heading: {Math.round(flight.trueTrack)}°</div>
          <div>Country: {flight.originCountry}</div>
          <div>Turb zone: {turb.radiusNm}nm radius</div>
          <div>Source: {turb.source}</div>
          {turb.rawText && (
            <div className="text-slate-500 mt-1 italic">{turb.rawText.slice(0, 80)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone }: { zone: TurbulenceEvent }) {
  const age = formatAge(zone.startTime);
  const remaining = formatDuration(zone);

  return (
    <div className="border-b border-[#1e2d4a] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${SEV_CLASS[zone.severity]}`}>
          {zone.severity.toUpperCase()}
        </span>
        <span className="text-[10px] text-slate-500">{zone.source}</span>
        {zone.source === "SIMULATED" && (
          <span className="text-[9px] text-amber-600 ml-auto">DEMO</span>
        )}
      </div>
      <div className="text-[11px] text-slate-400 space-y-0.5">
        <div>FL{Math.round(zone.altitudeFt / 100)} · {zone.radiusNm}nm radius</div>
        <div>Started {age} · {remaining}</div>
        {zone.rawText && (
          <div className="text-slate-500 italic">{zone.rawText.slice(0, 70)}</div>
        )}
      </div>
    </div>
  );
}
