// k6 load test — read-mostly scenario hitting the public endpoints.
//
// Usage (after `docker compose up`):
//   E2E_BASE_URL=https://localhost \
//   E2E_USER=admin E2E_PASS=admin-pass-1234 \
//   k6 run --insecure-skip-tls-verify scripts/load-test.k6.js
//
// Stages reach 100 concurrent VUs over a couple of minutes — adjust the
// `stages` block for longer soaks.
//
// Thresholds:
//   - p95 < 300 ms on cached read endpoints
//   - request error rate < 1%
// k6 fails the run if either threshold is breached.

import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE = __ENV.E2E_BASE_URL || 'https://localhost';
const USER = __ENV.E2E_USER || 'admin';
const PASS = __ENV.E2E_PASS;
if (!PASS) fail('Set E2E_PASS to a known admin password.');

export const options = {
  stages: [
    { duration: '30s', target: 25 },
    { duration: '60s', target: 100 },
    { duration: '60s', target: 100 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
  insecureSkipTLSVerify: true,
};

export function setup() {
  const r = http.post(`${BASE}/api/auth/login`,
    JSON.stringify({ username: USER, password: PASS }),
    { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login 200': (x) => x.status === 200 });
  if (r.status !== 200) fail(`login failed: ${r.status} ${r.body}`);
  return { token: r.json('accessToken') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  const dash = http.get(`${BASE}/api/dashboard/summary`, { headers });
  check(dash, { 'dashboard 200': (r) => r.status === 200 });

  const list = http.get(`${BASE}/api/complaints?page=1&pageSize=25`, { headers });
  check(list, { 'list 200': (r) => r.status === 200 });

  const fields = http.get(`${BASE}/api/dynamic-fields`, { headers });
  check(fields, { 'fields 200': (r) => r.status === 200 });

  sleep(1);
}
