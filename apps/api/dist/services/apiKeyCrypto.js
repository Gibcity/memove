"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt_api_key = encrypt_api_key;
exports.decrypt_api_key = decrypt_api_key;
exports.maybe_encrypt_api_key = maybe_encrypt_api_key;
const crypto = __importStar(require("node:crypto"));
const config_1 = require("../config");
const ENCRYPTED_PREFIX = 'enc:v1:';
function get_key() {
    return crypto.createHash('sha256').update(`${config_1.ENCRYPTION_KEY}:api_keys:v1`).digest();
}
function encrypt_api_key(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', get_key(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, enc]).toString('base64');
    return `${ENCRYPTED_PREFIX}${blob}`;
}
function decrypt_api_key(value) {
    if (!value)
        return null;
    if (typeof value !== 'string')
        return null;
    if (!value.startsWith(ENCRYPTED_PREFIX))
        return value; // legacy plaintext
    const blob = value.slice(ENCRYPTED_PREFIX.length);
    try {
        const buf = Buffer.from(blob, 'base64');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const enc = buf.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', get_key(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    }
    catch {
        return null;
    }
}
function maybe_encrypt_api_key(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith(ENCRYPTED_PREFIX))
        return trimmed;
    return encrypt_api_key(trimmed);
}
