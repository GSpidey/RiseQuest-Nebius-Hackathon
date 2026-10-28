import com.risequest.app.VoiceRecognitionRecovery;

public class VoiceRecognitionRecoveryTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        VoiceRecognitionRecovery policy = new VoiceRecognitionRecovery();
        policy.reset();
        long old = policy.invalidate();
        long current = policy.invalidate();
        check(!policy.isCurrent(old) && policy.isCurrent(current), "destroyed recognizer cannot own new callbacks");
        for (int round = 0; round < 30; round++) {
            for (int code : new int[]{8, 5, 11, 1, 2, 4}) {
                long delay = policy.retryDelay(code, false);
                check(delay >= 1500 && delay <= 15000, "transient error must recover with bounded backoff");
            }
            policy.succeeded();
            check(policy.retryDelay(8, false) == 1500, "successful turn resets backoff");
            check(policy.retryDelay(7, false) == 800, "no-match is a normal gap");
            check(policy.retryDelay(6, false) == 800, "silence is a normal gap");
        }
        policy.reset();
        check(policy.useOnDevice(true), "prefer available local recognition");
        check(policy.retryDelay(13, true) > 0 && !policy.useOnDevice(true), "missing local model falls back to system recognition");
        check(policy.retryDelay(12, false) == VoiceRecognitionRecovery.LANGUAGE_UNAVAILABLE, "unsupported system language needs user recovery");
        check(policy.retryDelay(9, false) == VoiceRecognitionRecovery.PERMISSION_REQUIRED, "permission revocation stops microphone");
        check(policy.retryDelay(10, false) >= 10000, "rate limit does not cause a rapid retry loop");
        policy.reset();
        check(policy.useOnDevice(true), "new deliberate session can retry a repaired local model");
        policy.retryDelay(8, true);
        policy.retryDelay(11, true);
        check(!policy.useOnDevice(true), "repeated local service failure switches providers");
        long stopped = policy.invalidate();
        policy.reset();
        check(!policy.isCurrent(stopped), "a restarted session rejects stopped-session callbacks");
        System.out.println("VOICE_RECOVERY_OK: 30 multi-error rounds, stale callbacks, silence, fallback, permissions and backoff");
    }
}
