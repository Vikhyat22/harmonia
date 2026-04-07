const metrics = {
  enqueued: 0,
  started: 0,
  completed: 0,
  failed: 0,
  skipped: 0,
  stopped: 0
};

export function incrementMetric(name) {
  if (typeof metrics[name] !== 'number') {
    return;
  }

  metrics[name] += 1;
}

export function getMetricsSnapshot() {
  return { ...metrics };
}
