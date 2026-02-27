export default class EmitMetricsSeries {
  constructor({ maxPoints = 24, bucketMs = 3000 } = {}) {
    this.maxPoints = maxPoints;
    this.bucketMs = bucketMs;
    const now = Date.now();
    this.points = this._emptyPoints(now);
  }

  _emptyPoints(now) {
    return Array.from({ length: this.maxPoints }, (_, idx) => ({
      ts_ms: now - (this.maxPoints - idx) * this.bucketMs,
      wrongDirection: 0,
      plateFinal: 0,
      ocrRaw: 0,
      speeding: 0,
    }));
  }

  initializeFromLogs(logs = [], now = Date.now()) {
    const bucketMap = new Map();
    const windowStart = now - this.maxPoints * this.bucketMs;

    logs.forEach((log) => {
      const tsMs = Number(log?.ts_ms || 0);
      if (!tsMs || tsMs < windowStart) return;

      const bucketTs = Math.floor(tsMs / this.bucketMs) * this.bucketMs;
      const current = bucketMap.get(bucketTs) || {
        wrongDirection: 0,
        plateFinal: 0,
        ocrRaw: 0,
        speeding: 0,
      };

      if (log?.type === "WRONG_DIRECTION") {
        current.wrongDirection += 1;
      }
      if (log?.type === "PLATE_FINAL") {
        current.plateFinal += 1;
      }
      if (log?.type === "OCR_RAW") {
        current.ocrRaw += 1;
      }
      if (log?.type === "SPEEDING") {
        current.speeding += 1;
      }

      bucketMap.set(bucketTs, current);
    });

    this.points = Array.from({ length: this.maxPoints }, (_, idx) => {
      const ts = now - (this.maxPoints - 1 - idx) * this.bucketMs;
      const bucketTs = Math.floor(ts / this.bucketMs) * this.bucketMs;
      const existing = bucketMap.get(bucketTs) || {
        wrongDirection: 0,
        plateFinal: 0,
        ocrRaw: 0,
        speeding: 0,
      };
      return {
        ts_ms: ts,
        wrongDirection: existing.wrongDirection,
        plateFinal: existing.plateFinal,
        ocrRaw: existing.ocrRaw,
        speeding: existing.speeding,
      };
    });

    return this.getPoints();
  }

  ingest(sample) {
    const point = {
      ts_ms: sample?.ts_ms ?? Date.now(),
      wrongDirection: Number(sample?.wrongDirection ?? 0),
      plateFinal: Number(sample?.plateFinal ?? 0),
      ocrRaw: Number(sample?.ocrRaw ?? 0),
      speeding: Number(sample?.speeding ?? 0),
    };

    this.points = [...this.points.slice(1), point];
    return this.getPoints();
  }

  getPoints() {
    return this.points.map((point) => ({ ...point }));
  }
}
