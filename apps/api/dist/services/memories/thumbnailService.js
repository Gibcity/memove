"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLocalThumbnail = ensureLocalThumbnail;
const jimp_1 = require("jimp");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const crypto_1 = __importDefault(require("crypto"));
const adminService_1 = require("../adminService");
const addons_1 = require("../../addons");
const THUMB_MAX = 800;
const THUMB_QUALITY = 80;
async function ensureLocalThumbnail(uploadsRoot, originalRelPath) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.JOURNEY))
        return null;
    const originalAbs = path_1.default.join(uploadsRoot, originalRelPath);
    try {
        await promises_1.default.access(originalAbs);
    }
    catch {
        return null;
    }
    // Deterministic name so concurrent requests don't race on the same photo.
    const hash = crypto_1.default.createHash('sha1').update(originalRelPath).digest('hex').slice(0, 16);
    const thumbRel = `journey/thumbs/${hash}.jpg`;
    const thumbAbs = path_1.default.join(uploadsRoot, thumbRel);
    try {
        const [srcStat, dstStat] = await Promise.all([
            promises_1.default.stat(originalAbs),
            promises_1.default.stat(thumbAbs).catch(() => null),
        ]);
        if (dstStat && dstStat.mtimeMs >= srcStat.mtimeMs) {
            const img = await jimp_1.Jimp.read(thumbAbs);
            return { thumbnailRelPath: thumbRel, width: img.bitmap.width, height: img.bitmap.height };
        }
        await promises_1.default.mkdir(path_1.default.dirname(thumbAbs), { recursive: true });
        // Jimp auto-applies EXIF orientation on read, matching sharp's .rotate() behavior.
        const img = await jimp_1.Jimp.read(originalAbs);
        const { width: w, height: h } = img.bitmap;
        if (w > THUMB_MAX || h > THUMB_MAX) {
            img.scaleToFit({ w: THUMB_MAX, h: THUMB_MAX });
        }
        await img.write(thumbAbs, { quality: THUMB_QUALITY });
        return { thumbnailRelPath: thumbRel, width: img.bitmap.width, height: img.bitmap.height };
    }
    catch {
        // Unsupported format, corrupt file, etc. — fall back to original in caller.
        return null;
    }
}
