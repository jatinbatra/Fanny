"use client";

import { useEffect, useRef } from "react";
import { Notification, TurbulenceSeverity } from "@/lib/types";
import { X, Bell, AlertTriangle, Plane, CheckCircle } from "lucide-react";

interface Props {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

const SEV_COLORS: Record<TurbulenceSeverity, string> = {
  light: "#ffc800",
  moderate: "#ff8c00",
  severe: "#ff3366",
  extreme: "#ff0044",
};

function NotifIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "turbulence_entry": return <AlertTriangle size={14} className="text-[#ff8c00]" />;
    case "turbulence_exit": return <CheckCircle size={14} className="text-[#00ff88]" />;
    case "severity_change": return <AlertTriangle size={14} className="text-[#ff3366]" />;
    case "tracking_added": return <Bell size={14} className="text-[#00d4ff]" />;
  }
}

export default function NotificationCenter({
  notifications, onDismiss, onClearAll,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [notifications.length]);

  if (notifications.length === 0) return null;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="absolute top-4 right-4 z-[2000] w-80 max-h-96 flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-[#00d4ff]" />
          <span className="text-xs font-mono text-slate-400">Alerts</span>
          {unread > 0 && (
            <span className="text-[10px] bg-[#ff3366] text-white px-1.5 rounded-full">
              {unread}
            </span>
          )}
        </div>
        <button
          onClick={onClearAll}
          className="text-[10px] text-slate-600 hover:text-slate-400 font-mono transition-colors"
        >
          Clear all
        </button>
      </div>

      <div
        ref={containerRef}
        className="overflow-y-auto space-y-1.5 max-h-80 pr-1"
      >
        {notifications.slice(0, 20).map((notif) => (
          <div
            key={notif.id}
            className={`
              flex items-start gap-3 p-3 rounded-lg border backdrop-blur-sm
              animate-slide-in-right
              ${notif.read
                ? "bg-[#0d152588] border-[#1e2d4a] opacity-60"
                : "bg-[#0d1525ee] border-[#1e2d4a] shadow-lg"
              }
            `}
          >
            <div className="shrink-0 mt-0.5">
              <NotifIcon type={notif.type} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono">
                <span
                  style={{
                    color: notif.severity ? SEV_COLORS[notif.severity] : "#00d4ff",
                  }}
                >
                  {notif.callsign}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {notif.message}
              </div>
              <div className="text-[9px] text-slate-600 mt-1">
                {new Date(notif.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <button
              onClick={() => onDismiss(notif.id)}
              className="shrink-0 text-slate-700 hover:text-slate-400 transition-colors mt-0.5"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Toast-style popup for brand new urgent alerts
export function TurbulenceToast({
  notification, onClose,
}: {
  notification: Notification;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  const color =
    notification.severity ? SEV_COLORS[notification.severity] : "#00d4ff";

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[3000] flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl animate-slide-in-right"
      style={{
        background: `#0d1525ee`,
        borderColor: color + "66",
        boxShadow: `0 0 20px ${color}22`,
      }}
    >
      <AlertTriangle size={16} style={{ color }} className="shrink-0" />
      <div className="font-mono">
        <div className="text-sm font-bold" style={{ color }}>
          {notification.callsign}
        </div>
        <div className="text-xs text-slate-400">{notification.message}</div>
      </div>
      <button
        onClick={onClose}
        className="ml-2 text-slate-600 hover:text-slate-300 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
}
