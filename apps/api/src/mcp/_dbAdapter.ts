// ponytail: shared DatabaseService-shaped adapter for MCP tools that live
// outside the Nest container. Consolidates 5 inline `as never` shims into
// one typed factory that returns the real DatabaseService shape.
import type Database from 'better-sqlite3';
import type { DatabaseService } from '../nest/database/database.service';

export function createDbAdapter(db: Database.Database): DatabaseService {
  return {
    connection: db,
    prepare: (sql) => db.prepare(sql),
    get: <T = unknown>(sql: string, ...params: unknown[]): T | undefined =>
      db.prepare(sql).get(...params) as T | undefined,
    all: <T = unknown>(sql: string, ...params: unknown[]): T[] =>
      db.prepare(sql).all(...params) as T[],
    run: (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
    transaction: <T>(fn: (conn: Database.Database) => T): T =>
      db.transaction(() => fn(db))(),
  };
}