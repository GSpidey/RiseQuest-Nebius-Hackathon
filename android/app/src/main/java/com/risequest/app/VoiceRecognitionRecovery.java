package com.risequest.app;

/** Android-independent retry and callback ownership policy for the voice service. */
public final class VoiceRecognitionRecovery {
    public static final long PERMISSION_REQUIRED = -1;
    public static final long LANGUAGE_UNAVAILABLE = -2;
    private long cycle;
    private int failures;
    private boolean onDeviceRejected;

    public void reset() {
        invalidate();
        failures = 0;
        onDeviceRejected = false;
    }

    // Invalidate before cancel/destroy: those operations may invoke old callbacks.
    public long invalidate() { return ++cycle; }
    public boolean isCurrent(long candidate) { return candidate == cycle; }
    public boolean useOnDevice(boolean available) { return available && !onDeviceRejected; }
    public void succeeded() { failures = 0; }

    public long retryDelay(int error, boolean wasOnDevice) {
        // SpeechRecognizer constants are stable API values; keep this class JVM-testable.
        if (error == 9) return PERMISSION_REQUIRED;
        if (error == 6 || error == 7) { // silence / no match are normal conversation gaps
            failures = 0;
            return 800;
        }
        failures = Math.min(6, failures + 1);
        if (wasOnDevice && (error == 12 || error == 13 || failures >= 2)) {
            onDeviceRejected = true;
        } else if (!wasOnDevice && (error == 12 || error == 13)) {
            return LANGUAGE_UNAVAILABLE;
        }
        long delay = Math.min(15000L, 1500L << (failures - 1));
        return error == 10 ? Math.max(10000L, delay) : delay;
    }
}
