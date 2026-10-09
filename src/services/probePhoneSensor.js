// A missing optional sensor must not crash manual sleep logging. Observable
// errors arrive asynchronously and cannot be caught by subscribe's try/catch.
function probePhoneSensor(sensor, configure, onError, timers = globalThis) {
  let subscription;
  let timeout;
  let disposed = false;
  const cleanup = () => {
    disposed = true;
    if (timeout !== undefined) timers.clearTimeout(timeout);
    subscription?.unsubscribe();
  };
  try {
    configure();
    subscription = sensor.subscribe({ next() {}, error(error) {
      if (!disposed) onError(error);
    } });
    timeout = timers.setTimeout(cleanup, 1000);
  } catch (error) {
    onError(error);
    cleanup();
  }
  return cleanup;
}
module.exports = { probePhoneSensor };
