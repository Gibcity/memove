"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KitineraryExtractorService = void 0;
const common_1 = require("@nestjs/common");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const node_child_process_2 = require("node:child_process");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 5 * 1024 * 1024;
let KitineraryExtractorService = class KitineraryExtractorService {
    binaryPath = null;
    onModuleInit() {
        this.binaryPath = this.findBinary();
        if (this.binaryPath) {
            console.log(`[KItinerary] extractor found at: ${this.binaryPath}`);
        }
        else {
            console.info('[KItinerary] extractor not found — booking import feature disabled');
        }
    }
    isAvailable() {
        return this.binaryPath !== null;
    }
    async extract(buffer, fileName) {
        if (!this.binaryPath) {
            throw new Error('kitinerary-extractor is not available on this system');
        }
        const ext = (0, node_path_1.extname)(fileName).toLowerCase();
        const tmpFile = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `memove-ki-${(0, node_crypto_1.randomUUID)()}${ext}`);
        try {
            (0, node_fs_1.writeFileSync)(tmpFile, buffer);
            const { stdout, stderr } = await execFileAsync(this.binaryPath, [tmpFile], {
                timeout: TIMEOUT_MS,
                maxBuffer: MAX_BUFFER,
            });
            if (stderr?.trim()) {
                // Filter expected noise: currency-symbol ambiguity warnings and vendor
                // extractor script errors are normal (every matching script is tried;
                // most won't match the current document).
                const unexpected = stderr
                    .split('\n')
                    .filter(l => l.trim())
                    .filter(l => !l.includes('Ambig') && !l.includes('JS ERROR') && !l.includes('Invalid result type from script'));
                if (unexpected.length) {
                    console.warn(`[KItinerary] stderr for "${fileName}":`, unexpected.join('\n'));
                }
            }
            const text = stdout.trim();
            if (!text)
                return [];
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                console.warn(`[KItinerary] non-JSON output for "${fileName}"`);
                return [];
            }
            if (Array.isArray(parsed))
                return parsed;
            if (typeof parsed === 'object' && parsed !== null)
                return [parsed];
            return [];
        }
        finally {
            try {
                (0, node_fs_1.unlinkSync)(tmpFile);
            }
            catch { }
        }
    }
    findBinary() {
        const envPath = process.env.KITINERARY_EXTRACTOR_PATH;
        if (envPath) {
            if ((0, node_fs_1.existsSync)(envPath))
                return envPath;
            console.warn(`[KItinerary] KITINERARY_EXTRACTOR_PATH="${envPath}" not found`);
            return null;
        }
        // Debian/Ubuntu: /usr/lib/<triplet>/libexec/kf6/kitinerary-extractor
        try {
            for (const dir of (0, node_fs_1.readdirSync)('/usr/lib')) {
                const candidate = (0, node_path_1.join)('/usr/lib', dir, 'libexec', 'kf6', 'kitinerary-extractor');
                if ((0, node_fs_1.existsSync)(candidate))
                    return candidate;
            }
        }
        catch { /* not a Debian system */ }
        // Fallback: binary in PATH
        try {
            (0, node_child_process_2.execSync)('kitinerary-extractor --version', { stdio: 'pipe', timeout: 3000 });
            return 'kitinerary-extractor';
        }
        catch { /* not in PATH */ }
        return null;
    }
};
exports.KitineraryExtractorService = KitineraryExtractorService;
exports.KitineraryExtractorService = KitineraryExtractorService = __decorate([
    (0, common_1.Injectable)()
], KitineraryExtractorService);
