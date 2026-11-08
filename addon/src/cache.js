/**
 * Purpose: the smallest cache the addon needs — a TTL map with single-flight, so a burst of clients
 * triggers one upstream call rather than one each. Status: 2026-11-07.
 */

export class TtlCache {
  #entries = new Map();
  #inFlight = new Map();

  constructor(ttlMs) {
    this.ttlMs = ttlMs;
  }

  /** Cached value for [key], or [loader]'s result (cached). Concurrent callers share one load. */
  async get(key, loader) {
    const hit = this.#entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const running = this.#inFlight.get(key);
    if (running) return running;

    const promise = (async () => {
      try {
        const value = await loader();
        this.#entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      } finally {
        this.#inFlight.delete(key);
      }
    })();

    this.#inFlight.set(key, promise);
    return promise;
  }

  /** Cached value if it is still fresh, else undefined — never loads. */
  peek(key) {
    const hit = this.#entries.get(key);
    return hit && hit.expiresAt > Date.now() ? hit.value : undefined;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }

  get size() {
    return this.#entries.size;
  }
}
