import { useEffect, useMemo, useState } from "react";

function formatAge(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function getStateColor(state) {
  switch (state) {
    case "healthy":
      return "#00e676";
    case "suspect":
      return "#ffcc00";
    case "reconnecting":
    case "connecting":
      return "#4da6ff";
    case "failed":
      return "#ff4d4d";
    case "cooldown":
      return "#ff8a65";
    default:
      return "#9aa5b1";
  }
}

function Chip({ label, value, accent }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: `1px solid ${accent || "var(--border)"}`,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.65 }}>{label}: </span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default function StreamHealthPanel({
  health,
  isLoading,
  isFetching,
  isError,
  resetKey,
}) {
  if (isLoading && !health) {
    return <div style={{ fontSize: 12, opacity: 0.75 }}>Loading stream health…</div>;
  }

  if (isError && !health) {
    return <div style={{ fontSize: 12, color: "#ff8a80" }}>Health unavailable</div>;
  }

  if (!health) {
    return <div style={{ fontSize: 12, opacity: 0.75 }}>No health data</div>;
  }

  const state = health?.state || "unknown";
  const reason = health?.last_reconnect_reason || "none";
  const frameAge = formatAge(health?.frame_age_sec);
  const freezeAge = formatAge(health?.freeze_age_sec);
  const reconnectAttempts =
    typeof health?.reconnect_attempts === "number"
      ? String(health.reconnect_attempts)
      : "—";
  const [stateHistory, setStateHistory] = useState([]);

  useEffect(() => {
    if (!state) return;
    setStateHistory((prev) => {
      if (prev[0]?.state === state) return prev;
      return [{ state, ts: Date.now() }, ...prev].slice(0, 6);
    });
  }, [state]);

  useEffect(() => {
    setStateHistory([]);
  }, [resetKey]);

  const transitionTrail = useMemo(() => {
    if (!stateHistory.length) return "—";
    return stateHistory
      .slice()
      .reverse()
      .map((entry) => entry.state)
      .join(" → ");
  }, [stateHistory]);

  const transitionCount = Math.max(0, stateHistory.length - 1);

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      <Chip label="State" value={state} accent={getStateColor(state)} />
      <Chip label="Reason" value={reason} />
      <Chip label="Last frame age" value={frameAge} />
      <Chip label="Freeze age" value={freezeAge} />
      <Chip label="Reconnect tries" value={reconnectAttempts} />
      <Chip label="Transitions" value={String(transitionCount)} />
      <Chip label="Recent states" value={transitionTrail} />
      {isFetching && <div style={{ fontSize: 11, opacity: 0.65 }}>Updating…</div>}
    </div>
  );
}
