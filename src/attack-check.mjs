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
  const staticText = response.ok ? await response.text() : '';
  if (response.ok) {
    try {
      const data = JSON.parse(staticText);
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

  // 2단계: 정적 /data.json에 확인 표시·메모가 없고, 화면은 같은 호스트의 /api/notes에서 메모를 받는지 비로그인으로 요청합니다.
  // 메모 본문은 기록하지 않고 개수만 적습니다.
  const markerInStatic = staticText.includes(config.sampleMarker);
  const memoPattern = /실습용 가상 [가-힣]+ 기록/gu;
  const page = await fetch(app, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const pageText = page.ok ? await page.text() : '';
  const pageMemos = (pageText.match(memoPattern) ?? []).length;
  const pageUsesApi = pageText.includes("fetch('/api/notes'");
  const nosniff = page.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff';
  const api = await fetch(new URL('/api/notes', app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  let apiCount = null;
  if (api.ok) {
    try {
      const body = await api.json();
      if (Array.isArray(body?.notes)) apiCount = body.notes.length;
    } catch {
      // JSON이 아니면 메모를 받지 못한 것으로 기록합니다.
    }
  }
  return [
    { attackId: 'anonymous_note_read', expected: '정적 /data.json은 404이거나 확인 표시·메모 0건',
      observed: response.status === 404 ? '정적 /data.json HTTP 404'
        : `정적 /data.json HTTP ${response.status}, 확인 표시 ${markerInStatic ? '있음' : '없음'}, 메모 ${visible ? '보임' : '0건'}` },
    { attackId: 'anonymous_page_read', expected: '첫 화면 HTML에 메모 문장 0건, 메모는 /api/notes에서 받음',
      observed: `첫 화면 HTTP ${page.status}, HTML 속 메모 문장 ${pageMemos}건, /api/notes 호출 ${pageUsesApi ? '있음' : '없음'}` },
    { attackId: 'api_notes_read', expected: '같은 호스트 서버 함수 /api/notes가 메모 4건을 돌려줌 (정상 요청)',
      observed: apiCount === null ? `/api/notes HTTP ${api.status}, 메모를 받지 못함` : `/api/notes HTTP ${api.status}, 메모 ${apiCount}건` },
    { attackId: 'page_nosniff_header', expected: '첫 화면 응답에 X-Content-Type-Options: nosniff',
      observed: nosniff ? '첫 화면 응답에 nosniff 헤더가 있음' : '첫 화면 응답에 nosniff 헤더가 없음' },
    { attackId: 'supabase_anon_notes_read', expected: 'anon 키로 notes 테이블 읽기 요청이 거부되거나 0행',
      observed: '미실행: anon 키 요청은 보내지 않음. SQL Editor 확인 표로 RLS 켜짐·정책 0·anon 권한 없음만 확인' },
  ];
}
