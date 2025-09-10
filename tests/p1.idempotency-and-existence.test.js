// tests/p1.idempotency-and-existence.test.js
/**
 * P1 통합 테스트: 존재 검증 + Idempotency
 * - /health OK
 * - /v1/reservations idempotent (reqId)
 * - /v1/wallet_tx/debit idempotent (txId)
 * - USER_NOT_FOUND / JOB_NOT_FOUND / CHANNEL_NOT_FOUND
 *
 * 서버가 로컬에서 떠있다고 가정 (BASE_URL= http://127.0.0.1:3000).
 * 필요 시 환경변수 BASE_URL 로 변경 가능.
 */
const request = require('supertest');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

describe('P1 - Existence & Idempotency', () => {
  let agent;
  beforeAll(() => {
    agent = request.agent(BASE);
  });

  test('health ok', async () => {
    const res = await agent.get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  describe('Reservations - idempotent by reqId', () => {
    const body = {
      userId: 'DR-01',
      channelId: 'CH-02',
      pickup: { lat: 37.5, lng: 127.0 },
      dropoff: { lat: 37.6, lng: 127.1 },
      scheduledAt: '2025-09-09T10:00:00Z',
      reqId: 'REQ-TEST-JEST-001',
    };

    let firstId;

    test('create -> 201', async () => {
      const res = await agent.post('/v1/reservations').send(body);
      expect([201, 200]).toContain(res.status); // 일부 환경에서 201/200 변동 허용
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('reservation.reservationId');
      firstId = res.body.reservation.reservationId;
    });

    test('same reqId -> 200 & idempotent=true', async () => {
      const res = await agent.post('/v1/reservations').send(body);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('idempotent', true);
      expect(res.body).toHaveProperty('reservation.reservationId', firstId);
    });
  });

  describe('Wallet DEBIT - idempotent by txId', () => {
    const body = {
      userId: 'DR-01',
      amount: 1500,
      reason: 'FEE',
      jobId: 'J0901',
      channelId: 'CH-02',
      txId: 'TX-TEST-JEST-001',
    };

    test('create -> 201', async () => {
      const res = await agent.post('/v1/wallet_tx/debit').send(body);
      expect([201, 200]).toContain(res.status);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('tx.txId', body.txId);
    });

    test('same txId -> 200 & idempotent=true', async () => {
      const res = await agent.post('/v1/wallet_tx/debit').send(body);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('idempotent', true);
      expect(res.body).toHaveProperty('tx.txId', body.txId);
    });
  });

  describe('Existence validation (404-like JSON errors)', () => {
    test('USER_NOT_FOUND', async () => {
      const res = await agent
        .post('/v1/wallet_tx/debit')
        .send({ userId: 'DR-404', amount: 1000, reason: 'FEE', jobId: 'J0901', channelId: 'CH-02' });
      // 서버는 상태코드 대신 JSON 에러를 반환할 수 있으므로 바디 체크
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'USER_NOT_FOUND' }));
    });

    test('JOB_NOT_FOUND', async () => {
      const res = await agent
        .post('/v1/wallet_tx/debit')
        .send({ userId: 'DR-01', amount: 1000, reason: 'FEE', jobId: 'J-NOPE', channelId: 'CH-02' });
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'JOB_NOT_FOUND' }));
    });

    test('CHANNEL_NOT_FOUND', async () => {
      const res = await agent
        .post('/v1/wallet_tx/debit')
        .send({ userId: 'DR-01', amount: 1000, reason: 'FEE', jobId: 'J0901', channelId: 'CH-404' });
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'CHANNEL_NOT_FOUND' }));
    });
  });
});
