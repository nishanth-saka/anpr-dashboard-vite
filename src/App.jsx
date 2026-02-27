import OverlayViewer from "./components/OverlayViewer";
import EmitAreaGraph from "./components/EmitAreaGraph";
import UnifiedLogList from "./components/UnifiedLogList";
import useLogsSocket from "./components/useLogsSocket";
import useRtspHealth from "./components/useRtspHealth";
import useTheme from "./components/useTheme";
import { useEffect, useMemo, useRef, useState } from "react";

export default function App() {
  const streamUrl =
    "https://traffic-events-engine-production.up.railway.app/preview/stream/cam_1";
  const healthUrl =
    "https://traffic-events-engine-production.up.railway.app/health";
  const cameraId = "cam_1";
  const streamName = "main";
  const [istNow, setIstNow] = useState(new Date());
  const [isReconnectPending, setIsReconnectPending] = useState(false);
  const [isStreamReloading, setIsStreamReloading] = useState(false);
  const [streamReloadToken, setStreamReloadToken] = useState(0);
  const [reconnectCooldownUntil, setReconnectCooldownUntil] = useState(0);
  const lastReconnectClickRef = useRef(0);

  const {
    logs,
    isHydrating,
    latestBatch,
    socketState,
    incomingCount,
    droppedCount,
    lastMessageTs,
    clearView,
    clearCache,
  } = useLogsSocket(
    "wss://traffic-events-engine-production.up.railway.app/ws/logs"
  );
  const { theme, toggleTheme } = useTheme();

  const healthQuery = useRtspHealth({
    healthUrl,
    camId: cameraId,
    streamName,
    pollMs: 3000,
  });

  const istLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(istNow),
    [istNow]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIstNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isStreamReloading) return;
    if (healthQuery.streamHealth?.state === "healthy") {
      setIsStreamReloading(false);
    }
  }, [isStreamReloading, healthQuery.streamHealth?.state]);

  useEffect(() => {
    if (!isStreamReloading) return;
    const timer = window.setTimeout(() => {
      setIsStreamReloading(false);
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [isStreamReloading]);

  const reconnectEndpoint = streamUrl.replace("/stream/", "/reconnect/");
  const reconnectCooldownMs = 2500;
  const reconnectDisabled =
    isReconnectPending || isStreamReloading || Date.now() < reconnectCooldownUntil;

  const handleReconnectRtsp = async () => {
    const now = Date.now();
    if (now - lastReconnectClickRef.current < reconnectCooldownMs) {
      return;
    }

    lastReconnectClickRef.current = now;
    setIsReconnectPending(true);
    setIsStreamReloading(true);
    setStreamReloadToken(Date.now());
    setReconnectCooldownUntil(now + reconnectCooldownMs);

    try {
      const response = await fetch(reconnectEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Reconnect failed: ${response.status}`);
      }

      await healthQuery.refetch();
    } catch (error) {
      console.error("Reconnect RTSP request failed:", error);
      setIsStreamReloading(false);
    } finally {
      setIsReconnectPending(false);
    }
  };

  return (
    <div
      style={{
        color: "var(--text)",
        padding: 20,
        backgroundColor: "var(--bg)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <h1 style={{ margin: 0 }}>🚦 ANPR Dashboard</h1>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>IST: {istLabel}</div>
        </div>
        <button
          type="button"
          className="action-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        >
          <span aria-hidden="true" style={{ marginRight: 6 }}>
            {theme === "light" ? "🌙" : "☀️"}
          </span>
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </div>

      <div className="dashboard-content">
        {/* LEFT — Preview */}
        <div className="preview-column">
          <OverlayViewer
            streamUrl={streamUrl}
            health={healthQuery.streamHealth}
            healthLoading={healthQuery.isLoading}
            healthFetching={healthQuery.isFetching}
            healthError={healthQuery.isError}
            onReconnect={handleReconnectRtsp}
            reconnectDisabled={reconnectDisabled}
            reconnectPending={isReconnectPending}
            reconnectActive={isStreamReloading}
            streamReloadToken={streamReloadToken}
          />
          <div className="graph-fill-wrap">
            <EmitAreaGraph
              latestBatch={latestBatch}
              logs={logs}
              isHydrating={isHydrating}
            />
          </div>
        </div>

        {/* RIGHT — Unified Logs */}
        <div
          className="logs-column"
        >
          <UnifiedLogList
            logs={logs}
            isHydrating={isHydrating}
            latestBatch={latestBatch}
            socketState={socketState}
            incomingCount={incomingCount}
            droppedCount={droppedCount}
            lastMessageTs={lastMessageTs}
            onClearView={clearView}
            onClearCache={clearCache}
          />
        </div>
      </div>
    </div>
  );
}
