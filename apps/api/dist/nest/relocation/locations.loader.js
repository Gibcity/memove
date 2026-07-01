"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLocations = loadLocations;
// ponytail: single source for the CBSA corpus (939 metros).
// All four former call sites (relocation.service, career.service,
// relocation_cost, relocation_admin) now route through here so we
// parse the JSON once per process and share one cache.
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
let cache = null;
function loadLocations() {
    if (!cache) {
        cache = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.resolve)(__dirname, '../../../../../data/processed/relocation/locations.json'), 'utf8'));
    }
    return cache;
}
