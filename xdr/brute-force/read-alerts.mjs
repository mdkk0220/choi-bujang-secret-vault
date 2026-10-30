// brute-force 경보 확인용 읽기 모듈입니다. decide.mjs 는 이 파일을 불러오지 않습니다.
// xdr/fixtures/brute-force.json 을 읽기만 하고, 경보마다 다섯 값만 뽑습니다.
//   시각(timestamp) · 출발 주소(srcip) · 계정(srcuser) · 규칙 수준(rule.level) · 설명(rule.description)
// 비밀값처럼 보이는 문자열은 출력 전에 [가림]으로 바꿉니다. 원본 파일은 고치지 않습니다.
//
// 실행: node xdr/brute-force/read-alerts.mjs
//   표준 출력: 경보 한 건당 한 줄(JSON)
//   표준 오류: "경보 N건, 뽑은 줄 N줄" 확인 한 줄 (두 수가 다르면 종료 코드 1)

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PATH = join(HERE, '..', 'fixtures', 'brute-force.json');

const MASK = '[가림]';

// 비밀값처럼 보이는 모양. 맞으면 그 부분만 가립니다.
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi,                              // 인증 헤더
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,      // JWT
  /\b(?:sk|pk|rk)_(?:live|test|[a-z]+)?_?[A-Za-z0-9]{8,}/g,          // 서비스 키 모양
  /\b(?:sb_secret|sb_publishable|ghp|gho|github_pat|xox[abprs])_[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:password|passwd|pwd|pass|secret|token|api[_-]?key|비밀번호|암호)\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,                                            // 긴 16진수
  /\b[A-Za-z0-9+\/_-]{40,}={0,2}/g,                                   // 긴 base64 모양
];

export function maskSecrets(value) {
  if (value === undefined || value === null) return null;
  let text = String(value);
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, MASK);
  return text;
}

// 경보 한 건에서 다섯 값만 뽑습니다. 그 밖의 칸(data.count, accounts 등)은 읽지 않습니다.
export function extractAlert(alert) {
  const rule = alert && typeof alert.rule === 'object' ? alert.rule : {};
  const data = alert && typeof alert.data === 'object' ? alert.data : {};
  const level = Number.isFinite(rule.level) ? rule.level : null;
  return {
    time: maskSecrets(alert?.timestamp),
    srcip: maskSecrets(data.srcip),
    user: maskSecrets(data.srcuser),
    level,
    description: maskSecrets(rule.description),
  };
}

export async function readAlerts(path = FIXTURE_PATH) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }
  return { alertCount: fixture.alerts.length, rows: fixture.alerts.map(extractAlert) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { alertCount, rows } = await readAlerts();
  for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  const same = alertCount === rows.length;
  process.stderr.write(`경보 ${alertCount}건, 뽑은 줄 ${rows.length}줄${same ? ' (같음)' : ' (다름)'}\n`);
  if (!same) process.exitCode = 1;
}
