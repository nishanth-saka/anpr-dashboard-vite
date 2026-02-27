import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_POLL_MS = 3000;

function getStreamHealth(payload, camId, streamName) {
  const rtsp = payload?.rtsp;
  if (!rtsp || !camId) return null;

  const cameraEntry = rtsp[camId];
  if (!cameraEntry) return null;

  if (cameraEntry?.[streamName] && typeof cameraEntry[streamName] === "object") {
    return cameraEntry[streamName];
  }

  if (cameraEntry?.streams?.[streamName]) {
    return cameraEntry.streams[streamName];
  }

  return typeof cameraEntry === "object" ? cameraEntry : null;
}

export default function useRtspHealth({
  healthUrl,
  camId,
  streamName = "main",
  pollMs = DEFAULT_POLL_MS,
}) {
  const query = useQuery({
    queryKey: ["rtsp-health", healthUrl, camId, streamName],
    queryFn: async () => {
      const response = await fetch(healthUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Health fetch failed: ${response.status}`);
      }

      return response.json();
    },
    enabled: Boolean(healthUrl && camId),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
    staleTime: pollMs,
    gcTime: 5 * 60 * 1000,
  });

  const streamHealth = useMemo(
    () => getStreamHealth(query.data, camId, streamName),
    [query.data, camId, streamName]
  );

  return {
    ...query,
    streamHealth,
  };
}
