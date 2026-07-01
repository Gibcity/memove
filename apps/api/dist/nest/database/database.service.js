"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
/**
 * Injectable wrapper around memove's existing better-sqlite3 connection.
 *
 * `db` is a Proxy onto the singleton connection the legacy app already uses
 * (WAL enabled), so Nest modules share the exact same connection — no second
 * connection, no split state, single writer preserved.
 */
let DatabaseService = class DatabaseService {
    /** The shared better-sqlite3 connection (same singleton the legacy app uses). */
    get connection() {
        return database_1.db;
    }
    prepare(sql) {
        return database_1.db.prepare(sql);
    }
    get(sql, ...params) {
        return database_1.db.prepare(sql).get(...params);
    }
    all(sql, ...params) {
        return database_1.db.prepare(sql).all(...params);
    }
    run(sql, ...params) {
        return database_1.db.prepare(sql).run(...params);
    }
    /** Run `fn` inside a synchronous better-sqlite3 transaction. */
    transaction(fn) {
        return database_1.db.transaction(() => fn(database_1.db))();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)()
], DatabaseService);
