"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Flight, TurbulenceEvent, TrackedFlight, Notification
} from "@/lib/types";
import FlightPanel from "./FlightPanel";
import NotificationCenter, { TurbulenceToast } from "./NotificationCenter";
import { RefreshCw, Radio, Radar } from "lucide-react";

// Leaflet must load client-side only
const RadarMap = dynamic(() => import("./RadarMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0e1a]">
      <div className="text-center">
        <div className="text-[#00d4ff] text-4xl mb-4">◎</div>
        <div className="text-slate-400 text-sm font-mono animate-pulse">
          Initializing radar...
        </div>
      </div>
    </div>
  ),
});

const REFRESH_INTERVAL = 20000; // 20s — keeps live ADS-B fresh, polite to free APIs

interface Viewport {
  lat: number;
  lon: number;
  distNm: number;
}

export default function TurbulenceRadar() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [turbulenceZones, setTurbulenceZones] = useState<TurbulenceEvent[]>([]);
  const [trackedFlights, setTrackedFlights] = useState<TrackedFlight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeToast, setActiveToast] = useState<Notification | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "mixed" | "simulated">("simulated");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevTurbStatusRef = useRef<Map<string, string>>(new Map());
  const viewportRef = useRef<Viewport | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const v = viewportRef.current;
      const qs = v
        ? `?lat=${v.lat.toFixed(3)}&lon=${v.lon.toFixed(3)}&dist=${Math.round(v.distNm)}`
        : "";
      const res = await fetch(`/api/flights${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setFlights(data.flights ?? []);
      setTurbulenceZones(data.turbulenceZones ?? []);
      setDataSource(data.source ?? "simulated");
      setLastRefresh(new Date());

      // Check tracked flights for status changes and generate notifications
      setTrackedFlights((tracked) => {
        for (const tf of tracked) {
          const liveFlight = (data.flights as Flight[]).find(
            (f) => f.icao24 === tf.icao24
          );
          if (!liveFlight) continue;

          const prevSev = prevTurbStatusRef.current.get(tf.icao24);
          const currSev = liveFlight.turbulence?.severity ?? "none";

          if (prevSev !== currSev) {
            let msg = "";
            let type: Notification["type"] = "turbulence_entry";

            if (currSev === "none" && prevSev && prevSev !== "none") {
              msg = `Exited turbulence zone`;
              type = "turbulence_exit";
            } else if (currSev !== "none" && (prevSev === "none" || !prevSev)) {
              msg = `Entered ${currSev} turbulence`;
              type = "turbulence_entry";
            } else if (currSev !== "none" && prevSev !== "none") {
              msg = `Turbulence changed to ${currSev}`;
              type = "severity_change";
            }

            if (msg) {
              const notif: Notification = {
                id: `${tf.icao24}-${Date.now()}`,
                type,
                flightId: tf.icao24,
                callsign: tf.callsign,
                severity: currSev !== "none" ? (currSev as any) : undefined,
                message: msg,
                timestamp: Date.now(),
                read: false,
              };
              setNotifications((prev) => [notif, ...prev].slice(0, 50));
              setActiveToast(notif);
            }

            prevTurbStatusRef.current.set(tf.icao24, currSev);
          }
        }
        return tracked;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch (default region) + interval refresh. The map refines the
  // viewport within ~1s and refetches for what's actually on screen.
  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Map reports its centre/zoom; refetch for the new view (debounced in map).
  const handleViewportChange = useCallback(
    (v: Viewport) => {
      viewportRef.current = v;
      fetchData();
    },
    [fetchData]
  );

  const handleTrack = useCallback((flight: Flight) => {
    setTrackedFlights((prev) => {
      if (prev.some((t) => t.icao24 === flight.icao24)) return prev;
      const tf: TrackedFlight = {
        icao24: flight.icao24,
        callsign: flight.callsign,
        addedAt: Date.now(),
        notified: false,
      };

      // Initial turbulence status
      prevTurbStatusRef.current.set(
        flight.icao24,
        flight.turbulence?.severity ?? "none"
      );

      const notif: Notification = {
        id: `track-${flight.icao24}-${Date.now()}`,
        type: "tracking_added",
        flightId: flight.icao24,
        callsign: flight.callsign,
        message: `Now tracking. Alerts enabled.`,
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((n) => [notif, ...n].slice(0, 50));
      setActiveToast(notif);

      return [...prev, tf];
    });
  }, []);

  const handleUntrack = useCallback((icao24: string) => {
    setTrackedFlights((prev) => prev.filter((t) => t.icao24 !== icao24));
    prevTurbStatusRef.current.delete(icao24);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const turbulentFlights = flights.filter((f) => !!f.turbulence);

  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a] overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-5 py-3 bg-[#0d1525] border-b border-[#1e2d4a] shrink-0">
        <div className="flex items-center gap-2.5">
          <Radar className="text-[#00d4ff]" size={20} />
          <span className="font-mono font-bold text-[#00d4ff] text-lg tracking-tight">
            TurbRadar
          </span>
        </div>

        <div className="h-5 w-px bg-[#1e2d4a]" />

        <div className="flex items-center gap-2">
          <Radio size={12} className="text-[#00ff88] animate-pulse" />
          <span className="text-xs font-mono text-slate-400">
            {loading ? "Scanning..." : "Live"}
          </span>
          {lastRefresh && (
            <span className="text-[10px] text-slate-600 font-mono">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && (
          <span className="text-[11px] text-red-400 font-mono bg-red-950 px-2 py-0.5 rounded border border-red-900">
            {error}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {dataSource !== "live" && (
            <span className="hidden sm:inline text-[10px] font-mono text-amber-500 border border-amber-800 px-2 py-0.5 rounded">
              {dataSource === "simulated"
                ? "DEMO — live feeds unreachable, retrying"
                : "LIVE FLIGHTS — turbulence model active"}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-[#00d4ff] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* Main layout — stacked on mobile, side-by-side on desktop */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative overflow-hidden min-h-[45vh]">
          <RadarMap
            flights={flights}
            turbulenceZones={turbulenceZones}
            trackedFlights={trackedFlights.map((t) => t.icao24)}
            onFlightSelect={setSelectedFlight}
            selectedFlight={selectedFlight}
            onViewportChange={handleViewportChange}
          />

          {/* Notification overlay on map */}
          <NotificationCenter
            notifications={notifications}
            onDismiss={dismissNotification}
            onClearAll={clearAllNotifications}
          />

          {/* Toast */}
          {activeToast && (
            <TurbulenceToast
              notification={activeToast}
              onClose={() => setActiveToast(null)}
            />
          )}

          {/* Loading overlay */}
          {loading && flights.length === 0 && (
            <div className="absolute inset-0 bg-[#0a0e1acc] flex items-center justify-center z-[1500]">
              <div className="text-center font-mono">
                <div className="text-[#00d4ff] text-5xl mb-4 animate-pulse">◎</div>
                <div className="text-slate-400 text-sm animate-pulse">
                  Fetching flight data...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel (bottom sheet on mobile) */}
        <div className="w-full md:w-80 shrink-0 flex flex-col h-[40vh] md:h-auto">
          <FlightPanel
            turbulentFlights={turbulentFlights}
            allTurbulenceZones={turbulenceZones}
            trackedFlights={trackedFlights}
            onTrack={handleTrack}
            onUntrack={handleUntrack}
            onSelectFlight={setSelectedFlight}
            selectedFlight={selectedFlight}
            dataSource={dataSource}
            flightCount={flights.length}
            turbZoneCount={turbulenceZones.length}
          />
        </div>
      </div>
    </div>
  );
}
