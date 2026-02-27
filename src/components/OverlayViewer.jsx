import StreamHealthPanel from "./StreamHealthPanel";

function getStatusColor(status) {
  switch (status) {
    case "healthy":
      return "#16a34a";
    case "suspect":
      return "#ca8a04";
    case "reconnecting":
    case "connecting":
      return "#2563eb";
    case "failed":
      return "#dc2626";
    case "cooldown":
      return "#ea580c";
    default:
      return "#64748b";
  }
}

export default function OverlayViewer({
  streamUrl,
  health,
  healthLoading,
  healthFetching,
  healthError,
  onReconnect,
  reconnectDisabled,
  reconnectPending,
  reconnectActive,
  streamReloadToken,
}) {
  const state = health?.state || "unknown";
  const streamSrc = `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}reload=${streamReloadToken}`;

  return (
    <div className="overlay-container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>Live Overlay</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              border: `1px solid ${getStatusColor(state)}`,
              color: getStatusColor(state),
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--panel)",
            }}
            title="Current RTSP connection status"
          >
            RTSP: {state}
          </div>
          <button
            type="button"
            className="action-btn"
            onClick={onReconnect}
            disabled={reconnectDisabled}
            title="Trigger RTSP reconnect"
          >
            {reconnectPending ? "Reconnecting…" : "Reconnect RTSP"}
          </button>
        </div>
      </div>
      <div className={`overlay-frame ${reconnectActive ? "overlay-frame-disabled" : ""}`}>
        <img
          key={streamReloadToken}
          src={streamSrc}
          alt="Live Stream"
          style={{
            width: "100%",
            borderRadius: "8px",
            border: "2px solid var(--border)",
            display: "block",
          }}
        />
        {reconnectActive && (
          <div className="overlay-waiting">
            <div className="overlay-spinner" />
            <div>Preview disabled • reconnecting RTSP…</div>
          </div>
        )}
      </div>
      <StreamHealthPanel
        health={health}
        isLoading={healthLoading}
        isFetching={healthFetching}
        isError={healthError}
        resetKey={streamReloadToken}
      />
    </div>
  );
}
