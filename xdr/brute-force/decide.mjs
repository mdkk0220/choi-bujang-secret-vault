// brute-force 경보 판정기. 심판이 인터넷 없이 이 파일 하나만 불러 경보마다 decide(alert)를 부릅니다.
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS 는 xdr/brute-force/patterns.json 의 패턴을 그대로 옮겨 적은 것입니다.

const PATTERNS = Object.freeze([
  Object.freeze({
    id: 'bf.same-source-failure-burst',
    name: '같은 주소의 짧은 시간 로그인 실패 연속',
    mitre: 'T1110.001',
    condition: '한 출발 주소(data.srcip)에서 짧은 시간 안에 로그인 실패가 연달아 쌓이고, 그 사이 성공이 없다.',
    evidence: 'MITRE ATT&CK T1110.001(Password Guessing)은 자격 증명을 모르는 공격자가 비밀번호를 반복해 추측하는 기법이며, 탐지는 인증 실패 기록을 모아 보는 방식이다.',
  }),
  Object.freeze({
    id: 'bf.password-spray',
    name: '여러 계정에 같은 비밀번호 대입',
    mitre: 'T1110.003',
    condition: '한 출발 주소(data.srcip)가 서로 다른 여러 계정에 같은 비밀번호로 로그인 실패를 넣는다(계정마다 실패 수는 적을 수 있다).',
    evidence: 'MITRE ATT&CK T1110.003(Password Spraying)은 흔한 비밀번호 하나나 소수를 여러 계정에 넣는 기법이며, 탐지 전략 DET0487은 여러 계정에 걸친 인증 실패를 본다.',
  }),
]);

const [BURST, SPRAY] = PATTERNS;

// 판정 경계(과제 기준)
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 확신도 계산에 쓰는 기준값. MITRE에 숫자 기준이 없어 이 경보 묶음의 Wazuh 규칙 수준(0~15)과 실패 건수로 매깁니다.
const BASE_WITH_T1110 = 0.45;   // 로그인 실패 + 규칙이 T1110 표시
const BASE_WITHOUT_T1110 = 0.2; // 로그인 실패는 있으나 T1110 표시 없음
const FAILURES_FULL = 40;       // 실패 건수가 이만큼이면 건수 몫을 다 채움
const ACCOUNTS_FULL = 10;       // 대입 계정 수가 이만큼이면 계정 몫을 다 채움
const SPRAY_MIN_ACCOUNTS = 3;   // 이보다 적으면 '여러 계정'으로 보지 않음
const LEVEL_FULL = 12;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round2 = (n) => Math.round(n * 100) / 100;

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 경보에서 판단에 필요한 값만 꺼냅니다. 형식이 이상해도 예외 없이 빈 값으로 둡니다.
function readSignals(alert) {
  const rule = alert && typeof alert.rule === 'object' && alert.rule ? alert.rule : {};
  const data = alert && typeof alert.data === 'object' && alert.data ? alert.data : {};
  const description = typeof rule.description === 'string' ? rule.description : '';
  const mitre = Array.isArray(rule.mitre) ? rule.mitre.map(String) : [];
  const level = Number.isFinite(rule.level) ? rule.level : 0;

  const listed = typeof data.accounts === 'string'
    ? new Set(data.accounts.split(',').map((s) => s.trim()).filter(Boolean)).size
    : 0;
  const counted = /계정\s*(\d+)\s*개/.exec(description);
  const accounts = Math.max(listed, counted ? Number(counted[1]) : 0);

  return {
    level,
    t1110: mitre.some((id) => id === 'T1110' || id.startsWith('T1110.')),
    failed: /실패/.test(description),
    succeededAfter: /성공/.test(description) && !/성공은\s*없/.test(description),
    failures: toNumber(data.count),
    accounts,
    manyAccountsWords: /여러\s*계정|서로\s*다른\s*계정/.test(description),
    samePassword: /같은\s*비밀번호/.test(description),
  };
}

// 패턴 1: 같은 주소의 짧은 시간 로그인 실패 연속
function scoreBurst(s) {
  if (!s.failed) return 0;
  let score = s.t1110 ? BASE_WITH_T1110 : BASE_WITHOUT_T1110;
  score += clamp01(s.failures / FAILURES_FULL) * 0.3;
  score += clamp01(s.level / LEVEL_FULL) * 0.25;
  if (s.succeededAfter) score -= 0.05; // 실패 뒤 성공은 본인 오타일 수 있어 덜 뚜렷함
  return clamp01(score);
}

// 패턴 2: 여러 계정에 같은 비밀번호 대입
function scoreSpray(s) {
  if (!s.failed && !s.samePassword) return 0;
  const accounts = s.accounts || (s.manyAccountsWords ? SPRAY_MIN_ACCOUNTS : 0);
  if (accounts < SPRAY_MIN_ACCOUNTS) return 0;
  let score = s.t1110 ? BASE_WITH_T1110 : BASE_WITHOUT_T1110;
  score += clamp01(accounts / ACCOUNTS_FULL) * 0.3;
  if (s.samePassword) score += 0.1;
  score += clamp01(s.level / LEVEL_FULL) * 0.15;
  return clamp01(score);
}

export function decide(alert) {
  const s = readSignals(alert);
  const scored = [
    { pattern: BURST, score: scoreBurst(s) },
    { pattern: SPRAY, score: scoreSpray(s) },
  ].sort((a, b) => b.score - a.score);
  const best = scored[0];
  const confidence = round2(best.score);

  if (confidence === 0) {
    return { action: 'record', confidence: 0, reason: '일치 패턴 없음(로그인 실패 신호 없음)' };
  }
  const action = confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record';
  const strength = action === 'block' ? '뚜렷하게 일치' : action === 'alert' ? '일부 일치' : '약하게 일치';
  return {
    action,
    confidence,
    reason: `${best.pattern.name}(${best.pattern.mitre}) ${strength}`,
  };
}
