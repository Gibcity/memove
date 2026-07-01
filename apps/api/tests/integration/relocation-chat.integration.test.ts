/**
 * Relocation chat — end-to-end tool-calling pipeline.
 * Mocks the OpenAI SDK so we exercise the controller -> chat service ->
 * completeWithTools -> handler chain without hitting the network.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { INestApplication } from '@nestjs/common';

const createMock = vi.hoisted(() => {
  process.env.MINIMAX_API_KEY = 'test-key';
  return vi.fn();
});
const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    testDb: db,
    dbMock: {
      db, closeDb: () => {}, reinitialize: () => {},
      getPlaceWithTags: () => null, canAccessTrip: () => null, isOwner: () => false,
    },
  };
});

vi.mock('openai', () => ({
  default: class { chat = { completions: { create: createMock } }; },
}));
vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-memove-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {}, SESSION_DURATION: '24h',
  SESSION_DURATION_MS: 86400000, SESSION_DURATION_SECONDS: 86400, DEFAULT_LANGUAGE: 'en',
}));
vi.mock('../../src/websocket', () => ({ broadcast: vi.fn(), broadcastToUser: vi.fn() }));

import { buildApp } from '../../src/bootstrap';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb, resetRateLimits } from '../helpers/test-db';
import { createUser } from '../helpers/factories';
import { authCookie } from '../helpers/auth';

let nestApp: INestApplication;
let app: Application;

beforeAll(async () => {
  createTables(testDb); runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});
beforeEach(() => { resetTestDb(testDb); resetRateLimits(nestApp); createMock.mockReset(); });
afterAll(async () => { await nestApp.close(); testDb.close(); });

describe('POST /api/relocation/chat — tool calling chain', () => {
  it('invokes compare_locations handler and returns {text, tool, data}', async () => {
    const { user } = createUser(testDb);
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: 'Comparing Austin vs Denver.',
          tool_calls: [{ type: 'function', function: { name: 'compare_locations', arguments: '{"locationIds":["austin-tx","denver-co"]}' } }],
        },
      }],
    });

    const res = await request(app)
      .post('/api/relocation/chat')
      .set('Cookie', authCookie(user.id))
      .send({ message: 'Compare Austin and Denver' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('agent');
    expect(res.body.text).toBe('Comparing Austin vs Denver.');
    expect(res.body.tool).toBe('compare_locations');
    expect(res.body.data).toBeDefined();
    expect(createMock).toHaveBeenCalledOnce();
  });
});