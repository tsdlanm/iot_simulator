/** Sliding-window limiter: at most `max` takes per `windowMs` for each key. In memory, so it is per process. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(t)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.prune(t)
    return true
  }

  /** Seconds until `key` may try again, for a Retry-After header. */
  retryAfter(key: string): number {
    const oldest = this.hits.get(key)?.[0]
    return oldest === undefined ? 1 : Math.max(1, Math.ceil((oldest + this.windowMs - this.now()) / 1000))
  }

  private prune(t: number) {
    for (const [key, list] of this.hits) if (list.every((at) => t - at >= this.windowMs)) this.hits.delete(key)
  }
}
