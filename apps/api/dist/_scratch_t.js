"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const s = zod_1.z.object({ north: zod_1.z.coerce.number().min(-90).max(90) });
const bad = {};
