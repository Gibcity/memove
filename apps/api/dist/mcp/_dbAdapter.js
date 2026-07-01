"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDbAdapter = createDbAdapter;
function createDbAdapter(db) {
    return {
        connection: db,
        prepare: (sql) => db.prepare(sql),
        get: (sql, ...params) => db.prepare(sql).get(...params),
        all: (sql, ...params) => db.prepare(sql).all(...params),
        run: (sql, ...params) => db.prepare(sql).run(...params),
        transaction: (fn) => db.transaction(() => fn(db))(),
    };
}
