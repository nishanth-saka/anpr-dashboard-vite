import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendLogs,
  clearPersistedLogs,
  getLogsSince,
  normalizeLog,
  pruneOlderThan,
} from "./logStorage";

const RETENTION_MINUTES = 10;
const MAX_IN_MEMORY_LOGS = 500;
const FLUSH_INTERVAL_MS = 3000;
const ROW_FLASH_MS = 3200;
const BATCH_BANNER_MS = 2600;
const HEARTBEAT_CHECK_MS = 5000;
const HEARTBEAT_STALE_MS = 15000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export default function useLogsSocket(url) {
  const [logs, setLogs] = useState([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [latestBatch, setLatestBatch] = useState(null);
  const [socketState, setSocketState] = useState("connecting");
  const [incomingCount, setIncomingCount] = useState(0);
  const [droppedCount, setDroppedCount] = useState(0);
  const [lastMessageTs, setLastMessageTs] = useState(null);

  const bufferRef = useRef([]);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const flushTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const manuallyClosedRef = useRef(false);
  const lastMessageTsRef = useRef(null);

  const clearView = useCallback(() => {
    setLogs([]);
  }, []);

  const clearCache = useCallback(async () => {
    await clearPersistedLogs();
    setLogs([]);
  }, []);

  useEffect(() => {
    let hydrateCancelled = false;

    (async () => {
      const minTsMs = Date.now() - RETENTION_MINUTES * 60 * 1000;
      try {
        const persisted = await getLogsSince(minTsMs);
        if (hydrateCancelled) return;
        setLogs(persisted.slice(-MAX_IN_MEMORY_LOGS).reverse());
      } catch (error) {
        console.error("Logs hydrate failed:", error);
      } finally {
        if (!hydrateCancelled) setIsHydrating(false);
      }
    })();

    return () => {
      hydrateCancelled = true;
    };
  }, []);

  useEffect(() => {
    const flushBuffer = async () => {
      const batch = bufferRef.current.splice(0, bufferRef.current.length);
      if (!batch.length) return;

      const batchToken = `batch-${Date.now()}`;
      const minTsMs = Date.now() - RETENTION_MINUTES * 60 * 1000;
      const newestFirstBatch = batch.slice().reverse();
      const flashBatch = newestFirstBatch.map((entry) => ({
        ...entry,
        _flashBatchToken: batchToken,
      }));

      const wrongDirectionCount = batch.filter(
        (entry) => entry?.type === "WRONG_DIRECTION"
      ).length;
      const plateFinalCount = batch.filter(
        (entry) => entry?.type === "PLATE_FINAL"
      ).length;
      const ocrRawCount = batch.filter((entry) => entry?.type === "OCR_RAW").length;
      const speedingCount = batch.filter((entry) => entry?.type === "SPEEDING").length;

      setLatestBatch({
        token: batchToken,
        count: flashBatch.length,
        ts_ms: Date.now(),
        wrongDirectionCount,
        plateFinalCount,
        ocrRawCount,
        speedingCount,
      });

      setLogs((prev) => {
        const merged = [...flashBatch, ...prev];
        const recentOnly = merged.filter((entry) => entry.ts_ms >= minTsMs);
        return recentOnly.slice(0, MAX_IN_MEMORY_LOGS);
      });

      window.setTimeout(() => {
        setLatestBatch((prev) => (prev?.token === batchToken ? null : prev));
      }, BATCH_BANNER_MS);

      window.setTimeout(() => {
        setLogs((prev) =>
          prev.map((entry) => {
            if (entry?._flashBatchToken !== batchToken) return entry;
            const { _flashBatchToken, ...rest } = entry;
            return rest;
          })
        );
      }, ROW_FLASH_MS);

      try {
        await appendLogs(batch);
        await pruneOlderThan(minTsMs);
      } catch (error) {
        console.error("Logs persist failed:", error);
      }
    };

    const clearReconnectTimer = () => {
      if (!reconnectTimerRef.current) return;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const clearHeartbeatTimer = () => {
      if (!heartbeatTimerRef.current) return;
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    };

    const clearFlushTimer = () => {
      if (!flushTimerRef.current) return;
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    };

    const scheduleReconnect = () => {
      if (manuallyClosedRef.current) return;

      setSocketState("reconnecting");
      clearReconnectTimer();

      const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current);
      const jitter = Math.floor(Math.random() * 400);
      const delay = exp + jitter;
      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = window.setTimeout(() => {
        connectSocket();
      }, delay);
    };

    const connectSocket = () => {
      if (manuallyClosedRef.current) return;

      let ws;
      setSocketState("connecting");

      try {
        ws = new WebSocket(url);
      } catch (error) {
        console.error("WebSocket init failed:", error);
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setSocketState("connected");
      };

      ws.onmessage = (event) => {
        const now = Date.now();
        lastMessageTsRef.current = now;
        setLastMessageTs(now);

        try {
          const data = normalizeLog(JSON.parse(event.data));
          bufferRef.current.push(data);
          setIncomingCount((prev) => prev + 1);
        } catch {
          setDroppedCount((prev) => prev + 1);
          console.error("Invalid JSON:", event.data);
        }
      };

      ws.onerror = () => {
        setSocketState("error");
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (manuallyClosedRef.current) {
          setSocketState("closed");
          return;
        }
        scheduleReconnect();
      };
    };

    flushTimerRef.current = window.setInterval(() => {
      flushBuffer();
    }, FLUSH_INTERVAL_MS);

    heartbeatTimerRef.current = window.setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const lastTs = lastMessageTsRef.current;
      if (!lastTs) return;

      if (Date.now() - lastTs > HEARTBEAT_STALE_MS) {
        setSocketState("stale");
        wsRef.current.close();
      }
    }, HEARTBEAT_CHECK_MS);

    connectSocket();

    return () => {
      manuallyClosedRef.current = true;
      clearReconnectTimer();
      clearHeartbeatTimer();
      clearFlushTimer();
      flushBuffer();
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [url]);

  return {
    logs,
    isHydrating,
    latestBatch,
    socketState,
    incomingCount,
    droppedCount,
    lastMessageTs,
    clearView,
    clearCache,
  };
}
