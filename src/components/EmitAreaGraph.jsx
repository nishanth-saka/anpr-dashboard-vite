import { useEffect, useMemo, useRef, useState } from "react";
import EmitMetricsSeries from "./EmitMetricsSeries";

const WIDTH = 860;
const HEIGHT = 220;
const PADDING_X = 18;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 24;
const ANIMATION_MS = 460;

function buildSmoothLinePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let idx = 1; idx < points.length; idx += 1) {
    const prev = points[idx - 1];
    const curr = points[idx];
    const midX = (prev.x + curr.x) / 2;
    d += ` Q ${midX} ${prev.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildAreaPath(points, chartBottom) {
  if (!points.length) return "";
  const linePath = buildSmoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${chartBottom} L ${first.x} ${chartBottom} Z`;
}

export default function EmitAreaGraph({ latestBatch, logs, isHydrating }) {
  const tracker = useMemo(() => new EmitMetricsSeries({ maxPoints: 26 }), []);
  const initialPoints = useMemo(() => tracker.getPoints(), [tracker]);
  const rafRef = useRef(null);
  const latestPointsRef = useRef(initialPoints);
  const didBootstrapRef = useRef(false);
  const [points, setPoints] = useState(initialPoints);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    if (isHydrating) return;

    const bootstrapped = tracker.initializeFromLogs(logs, Date.now());
    latestPointsRef.current = bootstrapped;
    requestAnimationFrame(() => {
      setPoints(bootstrapped);
    });
    didBootstrapRef.current = true;
  }, [isHydrating, logs, tracker]);

  useEffect(() => {
    if (!latestBatch?.token) return;
    if (!didBootstrapRef.current) {
      didBootstrapRef.current = true;
    }

    const target = tracker.ingest({
      ts_ms: latestBatch.ts_ms,
      wrongDirection: latestBatch.wrongDirectionCount,
      plateFinal: latestBatch.plateFinalCount,
      ocrRaw: latestBatch.ocrRawCount,
      speeding: latestBatch.speedingCount,
    });

    const start = latestPointsRef.current;
    const startAt = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const progress = Math.min((now - startAt) / ANIMATION_MS, 1);
      const eased = 1 - (1 - progress) ** 3;

      const interpolated = target.map((point, idx) => {
        const origin = start[idx] || point;
        return {
          ts_ms: point.ts_ms,
          wrongDirection:
            origin.wrongDirection + (point.wrongDirection - origin.wrongDirection) * eased,
          plateFinal: origin.plateFinal + (point.plateFinal - origin.plateFinal) * eased,
          ocrRaw: origin.ocrRaw + (point.ocrRaw - origin.ocrRaw) * eased,
          speeding: origin.speeding + (point.speeding - origin.speeding) * eased,
        };
      });

      setPoints(interpolated);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      latestPointsRef.current = target;
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [latestBatch, tracker]);

  const {
    wrongArea,
    wrongLine,
    finalArea,
    finalLine,
    ocrArea,
    ocrLine,
    speedingArea,
    speedingLine,
    chartBottom,
    latest,
  } = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...points.map((point) =>
        Math.max(point.wrongDirection, point.plateFinal, point.ocrRaw, point.speeding)
      )
    );

    const chartHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const chartBottomY = HEIGHT - PADDING_BOTTOM;
    const chartWidth = WIDTH - PADDING_X * 2;
    const stepX = chartWidth / Math.max(1, points.length - 1);

    const wrongPts = points.map((point, idx) => ({
      x: PADDING_X + idx * stepX,
      y: chartBottomY - (point.wrongDirection / maxValue) * chartHeight,
    }));

    const finalPts = points.map((point, idx) => ({
      x: PADDING_X + idx * stepX,
      y: chartBottomY - (point.plateFinal / maxValue) * chartHeight,
    }));

    const ocrPts = points.map((point, idx) => ({
      x: PADDING_X + idx * stepX,
      y: chartBottomY - (point.ocrRaw / maxValue) * chartHeight,
    }));

    const speedingPts = points.map((point, idx) => ({
      x: PADDING_X + idx * stepX,
      y: chartBottomY - (point.speeding / maxValue) * chartHeight,
    }));

    return {
      wrongArea: buildAreaPath(wrongPts, chartBottomY),
      wrongLine: buildSmoothLinePath(wrongPts),
      finalArea: buildAreaPath(finalPts, chartBottomY),
      finalLine: buildSmoothLinePath(finalPts),
      ocrArea: buildAreaPath(ocrPts, chartBottomY),
      ocrLine: buildSmoothLinePath(ocrPts),
      speedingArea: buildAreaPath(speedingPts, chartBottomY),
      speedingLine: buildSmoothLinePath(speedingPts),
      chartBottom: chartBottomY,
      latest:
        points[points.length - 1] ||
        { wrongDirection: 0, plateFinal: 0, ocrRaw: 0, speeding: 0 },
    };
  }, [points]);

  return (
    <div className="emit-graph-card">
      <div className="emit-graph-head">
        <h3 style={{ margin: 0 }}>Realtime Emit Levels</h3>
        <div className="emit-graph-legend-wrap">
          <span className="emit-legend emit-legend-wrong">
            Wrong Direction: {Math.round(latest.wrongDirection)}
          </span>
          <span className="emit-legend emit-legend-final">
            Plate Final: {Math.round(latest.plateFinal)}
          </span>
          <span className="emit-legend emit-legend-ocr">
            OCR RAW: {Math.round(latest.ocrRaw)}
          </span>
          <span className="emit-legend emit-legend-speeding">
            SPEEDING: {Math.round(latest.speeding)}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="emit-graph-svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="wrongDirFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.44" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="plateFinalFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="ocrRawFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="speedingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0.07" />
          </linearGradient>
        </defs>

        <line
          x1={PADDING_X}
          y1={chartBottom}
          x2={WIDTH - PADDING_X}
          y2={chartBottom}
          stroke="rgba(100,116,139,0.35)"
          strokeWidth="1"
        />

        <path d={wrongArea} fill="url(#wrongDirFill)" />
        <path d={finalArea} fill="url(#plateFinalFill)" />
        <path d={ocrArea} fill="url(#ocrRawFill)" />
        <path d={speedingArea} fill="url(#speedingFill)" />

        <path d={wrongLine} fill="none" stroke="#dc2626" strokeWidth="3" />
        <path d={finalLine} fill="none" stroke="#16a34a" strokeWidth="3" />
        <path d={ocrLine} fill="none" stroke="#2563eb" strokeWidth="3" />
        <path d={speedingLine} fill="none" stroke="#facc15" strokeWidth="3" />
      </svg>
    </div>
  );
}
