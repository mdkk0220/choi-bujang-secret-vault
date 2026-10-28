// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  if (config.step === 1) {
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }

  // 2단계: 메모를 Supabase 테이블로 옮긴 뒤, 공개 파일과 첫 화면에 메모가 남았는지 비로그인으로 다시 요청합니다.
  // 메모 본문은 기록하지 않고 개수만 적습니다.
  const memoPattern = /실습용 가상 [가-힣]+ 기록/gu;
  const page = await fetch(app, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const pageText = page.ok ? await page.text() : '';
  const pageMemos = (pageText.match(memoPattern) ?? []).length;
  const nosniff = page.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff';
  return [
    { attackId: 'anonymous_note_read', expected: '비로그인 /data.json에서 가상 메모 0건 또는 404',
      observed: visible ? `비로그인 요청에서 가상 메모가 보임 (HTTP ${response.status})`
        : `비로그인 요청에서 가상 메모 0건 (HTTP ${response.status})` },
    { attackId: 'anonymous_page_read', expected: '비로그인 첫 화면 응답에 가상 메모 문장 0건',
      observed: `비로그인 첫 화면 HTTP ${page.status}, 가상 메모 문장 ${pageMemos}건` },
    { attackId: 'page_nosniff_header', expected: '첫 화면 응답에 X-Content-Type-Options: nosniff',
      observed: nosniff ? '첫 화면 응답에 nosniff 헤더가 있음' : '첫 화면 응답에 nosniff 헤더가 없음' },
    { attackId: 'supabase_anon_notes_read', expected: 'anon 키로 notes 테이블 읽기 요청이 거부되거나 0행',
      observed: '미실행: anon 키 요청은 보내지 않음. SQL Editor 확인 표로 RLS 켜짐·정책 0·anon 권한 없음만 확인' },
  ];
}
