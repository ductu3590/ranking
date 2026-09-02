function nextPollingDelay(previousDelay, options = {}) {
  const minDelay = Number.isFinite(options.minDelay) ? options.minDelay : 5000;
  const maxDelay = Number.isFinite(options.maxDelay) ? options.maxDelay : 60000;
  if (options.success || !Number.isFinite(previousDelay)) return minDelay;
  return Math.min(maxDelay, Math.max(minDelay, previousDelay * 2));
}

module.exports = { nextPollingDelay };
