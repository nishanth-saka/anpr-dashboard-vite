export default function LogSection({ title, logs = [], filterType }) {

  const filtered = logs.filter(
    (log) => log?.type === filterType
  );

  return (
    <div style={{ flex: 1, margin: "10px" }}>
      <h3>{title}</h3>

      <div style={{
        background: "#1a1a1a",
        height: "250px",
        overflowY: "auto",
        padding: "10px",
        borderRadius: "8px"
      }}>
        {filtered.map((log, idx) => (
          <div key={idx} style={{
            marginBottom: "8px",
            padding: "6px",
            background: "#222",
            borderRadius: "6px",
            fontSize: "12px"
          }}>
            <div><b>Plate:</b> {log?.text || "-"}</div>
            <div><b>Conf:</b> {log?.conf || "-"}</div>
            <div><b>Vehicle:</b> {log?.vehicle_type || "-"}</div>
            <div><b>Cam:</b> {log?.cam_id || "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
