import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'risequest_error_logs_v1';

const safeStringify = (value) => {
  try {
    if (typeof value === 'string') return value;
    if (value instanceof Error) {
      return value.stack || value.message || String(value);
    }
    return JSON.stringify(value);
  } catch (_) {
    try {
      return String(value);
    } catch {
      return '[unstringifiable]';
    }
  }
};

const formatArgs = (args) => {
  try {
    return (Array.isArray(args) ? args : [args]).map(safeStringify).join(' ');
  } catch (_) {
    return '[log format failed]';
  }
};

const normalizeEntry = (level, args) => {
  const now = Date.now();
  const message = formatArgs(args);
  const stack = (Array.isArray(args) ? args : [args]).find((a) => a instanceof Error)?.stack || null;
  return {
    id: `${now}-${Math.random().toString(16).slice(2)}`,
    ts: now,
    level: String(level || 'info'),
    message,
    stack,
  };
};

const ErrorLogService = {
  _initialized: false,
  _maxEntries: 250,
  _writeInFlight: false,
  _queue: [],

  async _read() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async _write(entries) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  },

  async _flush() {
    if (this._writeInFlight) return;
    if (!this._queue.length) return;
    this._writeInFlight = true;
    try {
      const existing = await this._read();
      const merged = [...existing, ...this._queue];
      this._queue = [];
      const trimmed = merged.slice(Math.max(0, merged.length - this._maxEntries));
      await this._write(trimmed);
    } catch (_) {
      // ignore
      this._queue = [];
    } finally {
      this._writeInFlight = false;
    }
  },

  init({ maxEntries = 250 } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._maxEntries = Number(maxEntries) > 50 ? Number(maxEntries) : 250;

    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    const wrap = (level) => (...args) => {
      try {
        this._queue.push(normalizeEntry(level, args));
        // Debounced-ish flush
        setTimeout(() => {
          this._flush();
        }, 0);
      } catch (_) {
        // ignore
      }
      try {
        original[level](...args);
      } catch (_) {
        // ignore
      }
    };

    console.log = wrap('log');
    console.warn = wrap('warn');
    console.error = wrap('error');

    try {
      // Capture global JS errors (best effort)
      const ErrorUtilsRef = global.ErrorUtils;
      if (ErrorUtilsRef?.setGlobalHandler) {
        const prev = ErrorUtilsRef.getGlobalHandler && ErrorUtilsRef.getGlobalHandler();
        ErrorUtilsRef.setGlobalHandler((err, isFatal) => {
          try {
            this._queue.push(normalizeEntry(isFatal ? 'fatal' : 'error', [err]));
            setTimeout(() => {
              this._flush();
            }, 0);
          } catch (_) {
            // ignore
          }
          if (typeof prev === 'function') {
            prev(err, isFatal);
          }
        });
      }
    } catch (_) {
      // ignore
    }
  },

  async getLogs() {
    return this._read();
  },

  async clear() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // ignore
    }
  },
};

export default ErrorLogService;
