/**
 * Tiny in-process event counter backing the metrics subscriber (Sprint 3.2
 * decision #7 — a *second*, independent subscriber that proves multiple
 * subscribers each receive every event). This is a demonstration sink, not
 * durable telemetry; real observability lands with the AI substrate.
 */
const counts = new Map<string, number>();

export function recordEventMetric(name: string): number {
  const next = (counts.get(name) ?? 0) + 1;
  counts.set(name, next);
  return next;
}

export function getEventMetric(name: string): number {
  return counts.get(name) ?? 0;
}

export function totalEventMetrics(): number {
  let total = 0;
  for (const value of counts.values()) total += value;
  return total;
}

export function resetEventMetrics(): void {
  counts.clear();
}
