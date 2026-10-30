// web-injection 대응 연결. decide.mjs 의 판단 결과를 받아
//   1) block 후보만 출발 주소 기준 거부 규칙으로 xdr/web-injection/deny-rules.json 에 넣고
//   2) block·alert 알림을 xdr/alerts.log 에 한 줄씩 쌓습니다.
// decide.mjs 는 판단만 하고, 파일 쓰기·규칙 연결은 모두 이 파일에서 합니다.
//
// 판정기(src/decider.mjs) 연결은 하지 않습니다. 판정 요청 계약(docs/DECIDER_REQUEST.md)에
// 출발 주소 값이 없어 이 규칙을 실제 요청과 맞출 수 없기 때문입니다. 계약에 주소 값이 생기면
// 판정기가 deny-rules.json 의 규칙을 읽도록 연결합니다. 그 전까지 규칙은 appliedToDecider: false 입니다.
//
// 정상 사용자를 막지 않도록:
//   - 계정(srcuser)으로는 막지 않습니다. 주입 경보에는 계정이 없고, 같은 계정의 정상 사용을 막을 수 있습니다.
//   - 요청 주소(data.url)는 규칙·로그에 남기지 않습니다. 주입 문자열이 섞일 수 있기 때문입니다.
//   - 같은 출발 주소에서 block 이 아닌 경보(정상·애매)가 하나라도 있으면 그 주소는 규칙에 넣지 않고 보류합니다.
//   - 출발 주소가 IPv4 모양이 아니면 규칙으로 만들지 않습니다.
//
// 실행: node xdr/web-injection/respond.mjs          규칙 갱신 + 알림 기록
//       node xdr/web-injection/respond.mjs --check  위 작업 뒤 시험 경보를 다시 흘려 막힘·통과를 확인

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PATH = join(HERE, '..', 'fixtures', 'web-injection.json');
export const RULES_PATH = join(HERE, 'deny-rules.json');
export const LOG_PATH = join(HERE, '..', 'alerts.log');

export const RULE_ID = 'xdr.web_injection.deny_source';
export const RULE_TTL_MS = 24 * 60 * 60 * 1000; // 거부 규칙 유지 시간: 24시간

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const srcipOf = (alert) => (alert && alert.data && typeof alert.data.srcip === 'string' ? alert.data.srcip.trim() : '');
const idOf = (alert) => (alert && typeof alert.id === 'string' ? alert.id : '');
const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();

// 경보마다 decide 를 부릅니다. decide 가 실패하면 record 로 둡니다(막지 않음).
export async function judgeAlerts(alerts) {
  const judged = [];
  for (const alert of alerts) {
    let decision = { action: 'record', confidence: 0, reason: 'decide 실패' };
    try {
      const out = await decide(alert);
      if (out && ['block', 'alert', 'record'].includes(out.action)) decision = out;
    } catch { /* 막지 않고 record 로 남김 */ }
    judged.push({ alert, decision });
  }
  return judged;
}

// block 후보만 출발 주소별 거부 규칙으로 묶습니다.
export function buildRules(judged, now = new Date()) {
  const notBlockedSources = new Set(
    judged.filter((j) => j.decision.action !== 'block').map((j) => srcipOf(j.alert)).filter(Boolean),
  );
  const bySource = new Map();
  const held = [];
  for (const { alert, decision } of judged) {
    if (decision.action !== 'block') continue;
    const srcip = srcipOf(alert);
    if (!IPV4.test(srcip)) { held.push({ alertId: idOf(alert), why: '출발 주소가 IPv4 모양이 아님' }); continue; }
    if (notBlockedSources.has(srcip)) { held.push({ alertId: idOf(alert), srcip, why: '같은 주소에 정상·애매 경보가 있음' }); continue; }
    const rule = bySource.get(srcip) ?? {
      ruleId: RULE_ID,
      decision: 'deny',
      match: { srcip },
      alertIds: [],
      reasons: [],
      confidence: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RULE_TTL_MS).toISOString(),
      appliedToDecider: false,
    };
    rule.alertIds.push(idOf(alert));
    if (!rule.reasons.includes(decision.reason)) rule.reasons.push(oneLine(decision.reason));
    rule.confidence = Math.max(rule.confidence, decision.confidence);
    bySource.set(srcip, rule);
  }
  return { rules: [...bySource.values()], held };
}

// 기존 규칙 파일과 합칩니다. 만료된 규칙은 지우고, 같은 주소는 새 규칙으로 갱신합니다.
export function mergeRules(existing, fresh, now = new Date()) {
  const merged = new Map();
  for (const rule of existing) {
    if (rule && rule.match && Date.parse(rule.expiresAt) > now.getTime()) merged.set(rule.match.srcip, rule);
  }
  for (const rule of fresh) {
    const old = merged.get(rule.match.srcip);
    if (old) rule.alertIds = [...new Set([...old.alertIds, ...rule.alertIds])];
    merged.set(rule.match.srcip, rule);
  }
  return [...merged.values()].sort((a, b) => a.match.srcip.localeCompare(b.match.srcip));
}

// 출발 주소 하나가 지금 거부 대상인지 봅니다. 규칙이 없거나 만료됐으면 통과입니다.
export function checkSource(rules, srcip, now = new Date()) {
  const rule = rules.find((r) => r.match.srcip === srcip && Date.parse(r.expiresAt) > now.getTime());
  return rule ? { decision: 'deny', ruleId: rule.ruleId, alertIds: rule.alertIds } : { decision: 'allow' };
}

export function logLine(alert, decision, now = new Date()) {
  return [now.toISOString(), 'web-injection', decision.action, idOf(alert) || '(id 없음)',
    srcipOf(alert) || '-', decision.confidence, oneLine(decision.reason)].join('\t');
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

export async function respond({ now = new Date() } = {}) {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  if (fixture?.moduleKey !== 'web-injection' || !Array.isArray(fixture.alerts)) {
    throw new Error('web-injection 경보 묶음 형식이 아닙니다.');
  }
  const judged = await judgeAlerts(fixture.alerts);
  const { rules: fresh, held } = buildRules(judged, now);
  const existing = await readJson(RULES_PATH, { rules: [] });
  const rules = mergeRules(Array.isArray(existing.rules) ? existing.rules : [], fresh, now);

  await writeFile(RULES_PATH, `${JSON.stringify({
    schema: 'aleph.xdr.deny-rules.v1',
    moduleKey: 'web-injection',
    note: '판정 요청 계약에 출발 주소 값이 없어 판정기에 아직 연결하지 않았습니다.',
    updatedAt: now.toISOString(),
    rules,
    held,
  }, null, 2)}\n`, 'utf8');

  const lines = judged
    .filter((j) => j.decision.action === 'block' || j.decision.action === 'alert')
    .map((j) => logLine(j.alert, j.decision, now));
  await mkdir(dirname(LOG_PATH), { recursive: true });
  if (lines.length) await appendFile(LOG_PATH, `${lines.join('\n')}\n`, 'utf8');

  return { judged, rules, held, logged: lines.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const now = new Date();
  const { judged, rules, held, logged } = await respond({ now });
  process.stdout.write(`거부 규칙 ${rules.length}개(출발 주소 기준), 보류 ${held.length}건, alerts.log ${logged}줄 추가\n`);
  for (const r of rules) process.stdout.write(`  deny ${r.match.srcip} 근거 ${r.alertIds.join(',')} 만료 ${r.expiresAt}\n`);

  if (process.argv.includes('--check')) {
    // 시험 경보를 다시 흘림: 같은 출발 주소에서 요청이 온다고 보고 규칙에 걸리는지 봅니다.
    let wrong = 0;
    for (const { alert, decision } of judged) {
      const got = checkSource(rules, srcipOf(alert), now).decision;
      const want = decision.action === 'block' ? 'deny' : 'allow';
      if (got !== want) { wrong += 1; process.stdout.write(`  확인 필요 ${idOf(alert)}: ${decision.action} 인데 ${got}\n`); }
    }
    const blocked = judged.filter((j) => checkSource(rules, srcipOf(j.alert), now).decision === 'deny').length;
    process.stdout.write(`다시 흘린 경보 ${judged.length}건: 막힘 ${blocked}건, 통과 ${judged.length - blocked}건, 어긋남 ${wrong}건\n`);
    const later = new Date(now.getTime() + RULE_TTL_MS + 1000);
    const stillBlocked = judged.filter((j) => checkSource(rules, srcipOf(j.alert), later).decision === 'deny').length;
    process.stdout.write(`만료 뒤(24시간+1초) 막힘 ${stillBlocked}건\n`);
    process.stdout.write('이 확인은 로컬 연습이며 판정기·심판의 판정이 아닙니다.\n');
    if (wrong || stillBlocked) process.exitCode = 1;
  }
}
