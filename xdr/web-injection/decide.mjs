// web-injection 경보 판정기. 심판이 인터넷 없이 이 파일 하나만 불러 경보마다 decide(alert)를 부릅니다.
// 이 파일은 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 아래 PATTERNS 는 xdr/web-injection/patterns.json 의 패턴을 그대로 옮겨 적은 것입니다.

const PATTERNS = Object.freeze([
  Object.freeze({
    id: 'wi.sql-in-parameter',
    name: '요청 인자 안의 SQL 구문',
    mitre: 'T1190',
    condition: '요청 인자(검색어·id 등)에 SQL 구문 조각이나 조회를 이어 붙이는 표기가 들어 있고, 같은 출발 주소에서 반복된다.',
    evidence: 'MITRE ATT&CK T1190은 외부 공개 앱의 약점을 악용하는 기법이며, 사례로 SQL 주입을 통한 최초 침투(APT39 등)를 든다.',
  }),
  Object.freeze({
    id: 'wi.script-tag-in-parameter',
    name: '요청 인자 안의 스크립트 태그',
    mitre: 'T1190',
    condition: "요청 인자에 스크립트 태그 같은 삽입 표기가 들어 있고, 같은 출발 주소에서 반복된다. '스크립트'라는 낱말만 있는 일반 검색은 해당하지 않는다.",
    evidence: 'OWASP는 크로스 사이트 스크립팅을 웹 앱 입력에 브라우저용 스크립트를 넣는 주입 공격으로 설명하며, 이는 T1190이 말하는 공개 앱 입력 처리 약점의 악용에 해당한다.',
  }),
  Object.freeze({
    id: 'wi.path-traversal-repeat',
    name: '경로 거슬러 올라가기(../) 반복',
    mitre: 'T1190',
    condition: '파일 경로 인자에 상위 폴더로 올라가는 ../ 표기가 여러 단계 이어지고, 같은 출발 주소에서 반복된다.',
    evidence: 'OWASP는 ../ 표기로 웹 루트 밖 파일에 접근하는 공격을 경로 이탈로 설명하고, MITRE ATT&CK T1190 사례(C0017)에도 디렉터리 이탈 취약점 악용이 있다.',
  }),
]);

const [SQL, SCRIPT, TRAVERSAL] = PATTERNS;

// 판정 경계(과제 기준)
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 패턴별로 경보 설명(rule.description)과 요청 주소(data.url)에서 찾는 표기 모양.
// 실제 공격 문자열 대신 경보 설명의 낱말과 문서용 표기를 봅니다.
const FAMILY_SIGNS = new Map([
  [SQL, { text: /SQL|select|데이터베이스\s*조회/i, url: /sql|select/i }],
  [SCRIPT, { text: /스크립트|script/i, url: /script/i }],
  [TRAVERSAL, { text: /거슬러|경로\s*이탈|경로에\s*up/i, url: /\.\.\/|\.\.%2f|up-repeat/i }],
]);
const INJECTION_MARK = /구문|표기|표식|삽입/;               // 주입 표기가 있다고 적힌 경보
const NEGATED = /반복은\s*없|반복되지\s*않|아닙니다|공격\s*표기는\s*없/; // 설명이 스스로 아니라고 밝힌 경보

// 확신도 기준값. 근거 자료에 숫자 기준이 없어 이 경보 묶음의 Wazuh 규칙 수준(0~15)과 반복 횟수로 매깁니다.
const BASE_WITH_T1190 = 0.45;
const BASE_WITHOUT_T1190 = 0.15;
const REPEAT_FULL = 10;   // 같은 주소 반복이 이만큼이면 반복 몫을 다 채움
const LEVEL_FULL = 12;
const UNMATCHED_T1190 = 0.5; // T1190 표시는 있으나 세 패턴 표기를 못 찾은 경보: 확인 필요(alert)
const UNMATCHED_MAX = 0.84;  // 패턴과 맞지 않은 경보는 block 하지 않음

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round2 = (n) => Math.round(n * 100) / 100;

function toNumber(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readSignals(alert) {
  const rule = alert && typeof alert.rule === 'object' && alert.rule ? alert.rule : {};
  const data = alert && typeof alert.data === 'object' && alert.data ? alert.data : {};
  const description = typeof rule.description === 'string' ? rule.description : '';
  const url = typeof data.url === 'string' ? data.url : '';
  const mitre = Array.isArray(rule.mitre) ? rule.mitre.map(String) : [];
  return {
    description,
    url,
    level: Number.isFinite(rule.level) ? rule.level : 0,
    repeats: toNumber(data.count),
    t1190: mitre.some((id) => id === 'T1190' || id.startsWith('T1190.')),
    marked: INJECTION_MARK.test(description),
    negated: NEGATED.test(description),
  };
}

function scorePattern(pattern, s) {
  const signs = FAMILY_SIGNS.get(pattern);
  if (!signs.text.test(s.description) && !signs.url.test(s.url)) return 0;
  let score = s.t1190 ? BASE_WITH_T1190 : BASE_WITHOUT_T1190;
  score += clamp01(s.repeats / REPEAT_FULL) * 0.3;
  score += clamp01(s.level / LEVEL_FULL) * 0.2;
  if (s.marked && !s.negated) score += 0.05;
  if (s.negated) score -= 0.05;
  return clamp01(score);
}

function label(action) {
  if (action === 'block') return '뚜렷하게 일치';
  if (action === 'alert') return '일부 일치';
  return '약하게 일치';
}

function actionFor(confidence) {
  if (confidence >= BLOCK_AT) return 'block';
  if (confidence >= ALERT_AT) return 'alert';
  return 'record';
}

export function decide(alert) {
  const s = readSignals(alert);
  const best = PATTERNS
    .map((pattern) => ({ pattern, score: scorePattern(pattern, s) }))
    .sort((a, b) => b.score - a.score)[0];

  if (best.score > 0) {
    const confidence = round2(best.score);
    const action = actionFor(confidence);
    return { action, confidence, reason: `${best.pattern.name}(${best.pattern.mitre}) ${label(action)}` };
  }

  if (s.t1190) {
    // 규칙은 T1190을 표시했지만 세 패턴의 표기를 찾지 못함: 막지 않고 확인 대상으로만 남김
    let score = UNMATCHED_T1190 + clamp01(s.level / LEVEL_FULL) * 0.1;
    if (s.marked && !s.negated) score += 0.05;
    const confidence = round2(Math.min(UNMATCHED_MAX, score));
    return { action: actionFor(confidence), confidence, reason: 'T1190 표시만 있고 세 패턴과 직접 일치 없음(확인 필요)' };
  }

  return { action: 'record', confidence: 0, reason: '일치 패턴 없음(주입 신호 없음)' };
}
