import { useEffect, useMemo, useRef, useState } from "react";

const KNOWN_TYPES = [
  "OCR_RAW",
  "SPEEDING",
  "PLATE_FINAL",
  "WRONG_DIRECTION",
];

function getTypeStyle(type) {
  switch (type) {
    case "OCR_RAW":
      return { border: "#4da6ff", bg: "#eaf4ff" };
    case "PLATE_CANDIDATE":
      return { border: "#f59e0b", bg: "#fff7e6" };
    case "SPEEDING":
      return { border: "#f59e0b", bg: "#fff7e6" };
    case "PLATE_FINAL":
      return { border: "#16a34a", bg: "#e9f9ef" };
    case "WRONG_DIRECTION":
      return { border: "#ef4444", bg: "#ffefef" };
    default:
      return { border: "#94a3b8", bg: "#f4f6fa" };
  }
}

function formatRelativeMins(tsMs, nowMs) {
  if (!tsMs) return "—";
  const diffMs = Math.max(0, nowMs - tsMs);
  const mins = Math.floor(diffMs / 60000);
  return `${mins} min ago`;
}

function getConfidencePercent(log) {
  const conf = log?.conf ?? log?.data?.conf ?? log?.confidence ?? log?.data?.confidence;
  if (typeof conf !== "number" || Number.isNaN(conf)) return null;
  return conf <= 1 ? conf * 100 : conf;
}

function buildMetadata(log, nowMs) {
  const items = [];
  const type = String(log?.type || log?.data?.event_type || "").toUpperCase();
  const isTextEmit = type === "PLATE_FINAL" || type === "OCR_RAW";
  const isSpeeding = type === "SPEEDING";
  const camId = log?.cam_id || log?.data?.cam_id;
  const emitText = log?.data?.text || log?.text;

  if (camId) items.push({ label: "Cam", value: camId });
  if (isTextEmit && emitText) items.push({ label: "Text", value: emitText });
  
  if (isSpeeding) {
    const vehicleSpeed =
      log?.data?.metadata?.vehicle_speed_pxps ??
      log?.data?.speed_px_per_sec ??
      log?.speed_px_per_sec;

    if (typeof vehicleSpeed === "number" && !Number.isNaN(vehicleSpeed)) {
      items.push({ label: "Speed", value: `${vehicleSpeed.toFixed(1)} km/h` });
    }
  } else {
    const confPct = getConfidencePercent(log);
    if (typeof confPct === "number") {
      items.push({ label: "Conf", value: `${confPct.toFixed(2)}%` });
    }
  }
  
  if (log?.vehicle_type) items.push({ label: "Vehicle", value: log.vehicle_type });
  if (log?.direction) items.push({ label: "Dir", value: log.direction });
  items.push({ label: "Time", value: formatRelativeMins(log?.ts_ms, nowMs) });

  return items;
}

function getVehicleIcon(log) {
  const raw = String(log?.vehicle_class || log?.vehicle_type || "")
    .trim()
    .toLowerCase();

  if (!raw) return "🚗";
  if (raw.includes("bike") || raw.includes("motorcycle") || raw.includes("scooter")) {
    return "🏍️";
  }
  if (raw.includes("truck") || raw.includes("lorry")) return "🚚";
  if (raw.includes("bus")) return "🚌";
  if (raw.includes("van")) return "🚐";
  if (raw.includes("auto") || raw.includes("rickshaw")) return "🛺";
  if (raw.includes("tractor")) return "🚜";
  return "🚗";
}

export default function UnifiedLogList({
  logs,
  isHydrating,
  latestBatch,
  socketState,
  incomingCount,
  droppedCount,
  lastMessageTs,
  onClearView,
  onClearCache,
}) {
  const listRef = useRef(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(KNOWN_TYPES);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const availableTypes = useMemo(() => {
    const fromLogs = logs
      .map((log) => log?.type)
      .filter(Boolean);
    return Array.from(new Set([...KNOWN_TYPES, ...fromLogs]));
  }, [logs]);

  const allUnselected = selectedTypes.length === 0;

  const filteredLogs = useMemo(() => {
    if (!selectedTypes.length) return [];

    const seenByVehicleEvent = new Map();
    let speedingVisibleCount = 0;

    return logs.filter((log) => {
      if (!selectedTypes.includes(log?.type)) return false;
      if (log?.type === "WRONG_DIRECTION") {
        const confPct = getConfidencePercent(log);
        if (!(typeof confPct === "number" && confPct > 25)) return false;
      }

      if (log?.type === "SPEEDING") {
        if (speedingVisibleCount >= 2) return false;
        speedingVisibleCount += 1;
        return true;
      }

      const trackId = log?.track_id ?? log?.data?.track_id;
      const rawText = log?.text ?? log?.data?.text;
      const normalizedText = typeof rawText === "string" ? rawText.trim() : "";
      const hasValidText =
        normalizedText.length > 0 && normalizedText.toUpperCase() !== "NULL";

      if (!trackId || !hasValidText) return true;

      const key = `${String(log?.type || "UNKNOWN")}::${String(trackId)}::${normalizedText}`;
      const count = seenByVehicleEvent.get(key) || 0;

      if (count >= 2) return false;

      seenByVehicleEvent.set(key, count + 1);
      return true;
    });
  }, [logs, selectedTypes]);

  const lastSeenLabel = useMemo(() => {
    if (!lastMessageTs) return "never";
    const ageSec = Math.max(0, Math.floor((nowMs - lastMessageTs) / 1000));
    if (ageSec < 60) return `${ageSec}s ago`;
    const mins = Math.floor(ageSec / 60);
    const secs = ageSec % 60;
    return `${mins}m ${secs}s ago`;
  }, [lastMessageTs, nowMs]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = 0;
  }, [filteredLogs.length]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedLog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleCopyJson = async () => {
    if (!selectedLog) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
      setCopied(true);
    } catch (error) {
      console.error("Copy JSON failed:", error);
    }
  };

  const toggleType = (type) => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((item) => item !== type);
      }
      return [...prev, type];
    });
  };

  const onUnselectAllChange = (checked) => {
    if (checked) {
      setSelectedTypes([]);
      return;
    }
    setSelectedTypes(availableTypes);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 32 }}>📜 Live Logs</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="action-btn" onClick={onClearView}>
            Clear View
          </button>
          <button type="button" className="action-btn" onClick={onClearCache}>
            Clear Cache
          </button>
        </div>
      </div>

      {isHydrating && (
        <div
          style={{
            fontSize: 24,
            opacity: 0.7,
            marginBottom: 10,
          }}
        >
          Restoring recent logs…
        </div>
      )}

      <div
        style={{
          marginBottom: 10,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span><strong>WS:</strong> {socketState || "unknown"}</span>
        <span><strong>In:</strong> {incomingCount}</span>
        <span><strong>Dropped:</strong> {droppedCount}</span>
        <span><strong>Last msg:</strong> {lastSeenLabel}</span>
        <span><strong>Visible:</strong> {filteredLogs.length}/{logs.length}</span>
      </div>

      <div
        style={{
          marginBottom: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Filter Emit Type:
        </span>
        {availableTypes.map((type) => (
          <label
            key={type}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 24 }}
          >
            <input
              type="checkbox"
              checked={selectedTypes.includes(type)}
              onChange={() => toggleType(type)}
            />
            {type}
          </label>
        ))}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={allUnselected}
            onChange={(event) => onUnselectAllChange(event.target.checked)}
          />
          Unselect all
        </label>
      </div>

      {latestBatch && (
        <div className="log-batch-indicator">
          +{latestBatch.count} new emit{latestBatch.count > 1 ? "s" : ""}
        </div>
      )}

      <div ref={listRef} style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
        {filteredLogs.map((log, index) => {
          const typeStyle = getTypeStyle(log?.type);
          const metadata = buildMetadata(log, nowMs);
          const vehicleIcon = getVehicleIcon(log);
          const key = `${log?.id || "tmp"}-${log?.ts_ms || index}-${index}`;
          const isNew = Boolean(log?._flashBatchToken);
          const isCriticalNew = isNew && log?.type === "WRONG_DIRECTION";

          return (
            <div
              key={key}
              className={[
                index === 0 ? "log-row-fade-in" : "",
                isNew ? "log-row-flash" : "",
                isNew ? "log-row-flight-flip" : "",
                isCriticalNew ? "log-row-flash-critical" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedLog(log)}
              style={{
                padding: "12px 14px",
                marginBottom: "8px",
                background: typeStyle.bg,
                borderLeft: `5px solid ${typeStyle.border}`,
                borderRadius: 8,
                fontSize: 28,
                minHeight: 132,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  opacity: 0.9,
                  fontSize: 24,
                  fontWeight: 800,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{log?.type || "UNKNOWN"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isNew && <span className="log-new-badge">NEW</span>}
                  <span title={String(log?.vehicle_class || log?.vehicle_type || "unknown")}
                    style={{ fontSize: 30, lineHeight: 1 }}>
                    {vehicleIcon}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 6, fontWeight: 600, fontSize: 28 }}>
                {log?.message || "—"}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 10,
                  fontSize: 24,
                }}
              >
                {metadata.map((item) => (
                  <span
                    key={`${item.label}-${item.value}`}
                    style={{
                      border: "1px solid rgba(100,116,139,0.35)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      background: "rgba(255,255,255,0.45)",
                    }}
                  >
                    <strong>{item.label}:</strong> {item.value}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {!filteredLogs.length && !isHydrating && (
          <div
            style={{
              fontSize: 24,
              opacity: 0.7,
            }}
          >
            No logs yet
          </div>
        )}
      </div>

      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(820px, 92vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <strong>Emit JSON</strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="action-btn" onClick={handleCopyJson}>
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setSelectedLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.5,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
