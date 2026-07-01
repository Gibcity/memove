import type { DatabaseService } from '../nest/database/database.service';
import crypto from 'crypto';

// ponytail: SQLite-backed K/V for relocation scoring. Single-row PK, JSON
// blob in `value`, UNIX seconds in `expires_at`. Auto-expires stale
// entries on read; on expiry the row is deleted inline. No write-side
// sweep — pong on read is fine because expired rows only accumulate when
// keys stop being asked for, and we cap distinct keys at one-per-scoring
// call (see `cacheKey` in relocation.service.ts). Promote to Redis when
// multi-instance (p95 collides at >1 worker).
export class RelocationCache {
  constructor(private readonly db: DatabaseService) {}

  get<T>(key: string): T | null {
    const row = this.db.get<{ value: string; expires_at: number }>(
      'SELECT value, expires_at FROM relocation_cache WHERE key = ?',
      key,
    );
    if (!row || typeof row.value !== 'string' || typeof row.expires_at !== 'number') return null;
    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) {
      this.db.run('DELETE FROM relocation_cache WHERE key = ?', key);
      return null;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      // ponytail: poisoned entry — drop and recompute rather than 500.
      this.db.run('DELETE FROM relocation_cache WHERE key = ?', key);
      return null;
    }
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    // ponytail: skip cycles / BigInt — better to recompute than 500.
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return;
    }
    if (serialized === undefined) return; // JSON.stringify(undefined) === undefined
    this.db.run(
      `INSERT INTO relocation_cache (key, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      key,
      serialized,
      Math.floor(Date.now() / 1000) + ttlSeconds,
    );
  }

  del(key: string): void {
    this.db.run('DELETE FROM relocation_cache WHERE key = ?', key);
  }

  // ponytail: stable cache-key hash. Sorted top-level keys suffice for
  // scoreLocations' flat filter shape; nested objects would need a proper
  // canonicalization (out of scope here).
  static hashKey(parts: Record<string, unknown>): string {
    const sorted = JSON.stringify(parts, Object.keys(parts).sort());
    return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 32);
  }
}
