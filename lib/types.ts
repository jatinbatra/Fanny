export type TurbulenceSeverity = "light" | "moderate" | "severe" | "extreme";

export interface Flight {
  icao24: string;
  callsign: string;
  originCountry: string;
  longitude: number;
  latitude: number;
  altitude: number; // metres
  velocity: number; // m/s
  trueTrack: number; // heading degrees
  verticalRate: number; // m/s
  onGround: boolean;
  lastContact: number; // unix timestamp
  // derived
  turbulence?: TurbulenceEvent;
}

export interface TurbulenceEvent {
  id: string;
  severity: TurbulenceSeverity;
  lat: number;
  lon: number;
  altitudeFt: number;
  radiusNm: number;     // affected radius in nautical miles
  startTime: number;    // unix ms
  endTime?: number;     // unix ms (undefined = ongoing)
  source: "PIREP" | "SIGMET" | "SIMULATED";
  rawText?: string;
  durationMinutes?: number;
}

export interface PIREP {
  rawText: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  severity: TurbulenceSeverity;
  reportTime: number;
}

export interface TrackedFlight {
  icao24: string;
  callsign: string;
  addedAt: number;
  notified: boolean;
}

export interface Notification {
  id: string;
  type: "turbulence_entry" | "turbulence_exit" | "severity_change" | "tracking_added";
  flightId: string;
  callsign: string;
  severity?: TurbulenceSeverity;
  message: string;
  timestamp: number;
  read: boolean;
}
