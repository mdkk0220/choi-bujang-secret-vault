// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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

  if (config.step === 3) return runStep3Checks(config, app, response, staticText);
  if (config.step === 4) return runStep4Checks(config, app, response, staticText);

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

// 3단계: 로그인 없이 보낸 요청과 위조한 신원이 자료 API에서 거부되는지 실제로 요청합니다.
// 로그인한 A의 정상 요청과 B의 타인 메모 접근은 이 점검에서 보내지 않으므로 미실행으로 남깁니다.
// 응답 본문의 메모 내용은 기록하지 않고 상태 코드와 개수만 적습니다.
async function runStep3Checks(config, app, staticResponse, staticText) {
  const timeout = () => AbortSignal.timeout(10000);
  const api = (path, init = {}) => fetch(new URL(path, app), { redirect: 'error', signal: timeout(), ...init });
  const describe = async (res) => {
    let shape = '자료 없음';
    try {
      const body = await res.json();
      if (Array.isArray(body)) shape = `메모 배열 ${body.length}건`;
      else if (body && typeof body.error === 'string') shape = `오류 ${body.error}`;
      else if (body && (body.title !== undefined || body.notes !== undefined)) shape = '자료 있음';
    } catch {
      // JSON이 아니면 자료 없음으로 둡니다.
    }
    return `HTTP ${res.status}, ${shape}`;
  };
  const noteId = '00000000-0000-4000-8000-00000000c3c3';
  const markerInStatic = staticText.includes(config.sampleMarker);

  const list = await api('/api/notes');
  const create = await api('/api/notes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: noteId, title: '점검용 가상 메모', body: '무로그인 추가 시도' }),
  });
  const forged = await api('/api/notes?userId=00000000-0000-4000-8000-000000000001&role=admin', {
    headers: { 'x-user-id': '00000000-0000-4000-8000-000000000001', 'x-role': 'admin' },
  });
  const badToken = await api('/api/notes', { headers: { authorization: 'Bearer aaaa.bbbb.cccc' } });
  const one = await api(`/api/notes/${noteId}`);
  const update = await api(`/api/notes/${noteId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '점검용', body: '무로그인 수정 시도' }),
  });
  const remove = await api(`/api/notes/${noteId}`, { method: 'DELETE' });
  const page = await api('/');
  const pageText = page.ok ? await page.text() : '';
  const pageMemos = (pageText.match(/실습용 가상 [가-힣]+ 기록/gu) ?? []).length;
  const nosniff = page.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff';

  return [
    { attackId: 'anonymous_note_read', expected: '정적 /data.json은 404이거나 확인 표시·메모 0건',
      observed: staticResponse.status === 404 ? '정적 /data.json HTTP 404'
        : `정적 /data.json HTTP ${staticResponse.status}, 확인 표시 ${markerInStatic ? '있음' : '없음'}` },
    { attackId: 'anonymous_api_list', expected: '무로그인 GET /api/notes는 401, 자료 없음',
      observed: `무로그인 GET /api/notes ${await describe(list)}` },
    { attackId: 'anonymous_api_create', expected: '무로그인 POST /api/notes는 401, 저장 안 됨',
      observed: `무로그인 POST /api/notes ${await describe(create)}` },
    { attackId: 'anonymous_api_item', expected: '무로그인 GET·PUT·DELETE /api/notes/:id는 모두 401',
      observed: `무로그인 GET ${one.status}, PUT ${update.status}, DELETE ${remove.status}` },
    { attackId: 'forged_identity_list', expected: '토큰 없이 userId·role만 보낸 요청은 401',
      observed: `userId·role 헤더·쿼리만 보낸 GET /api/notes ${await describe(forged)}` },
    { attackId: 'invalid_token_list', expected: '검증되지 않는 Bearer 토큰은 401',
      observed: `엉터리 Bearer 토큰 GET /api/notes ${await describe(badToken)}` },
    { attackId: 'page_static_memo', expected: '첫 화면 HTML에 메모 문장 0건',
      observed: `첫 화면 HTTP ${page.status}, HTML 속 메모 문장 ${pageMemos}건` },
    { attackId: 'page_nosniff_header', expected: '첫 화면 응답에 X-Content-Type-Options: nosniff',
      observed: nosniff ? '첫 화면 응답에 nosniff 헤더가 있음' : '첫 화면 응답에 nosniff 헤더가 없음' },
    { attackId: 'login_a_crud', expected: 'A 로그인 뒤 메모 추가·수정·삭제 성공, 삭제 뒤 GET 404',
      observed: '미실행: 이 점검은 A 계정 토큰을 쓰지 않음. 화면에서 학생이 직접 확인' },
    { attackId: 'login_b_other_note', expected: 'B 로그인으로 A 메모 접근 (4단계에서 기록)',
      observed: '미실행: 소유자 검사 전 단계라 4단계에서 기록' },
    { attackId: 'supabase_anon_notes_read', expected: 'anon 키로 notes 테이블 읽기 요청이 거부되거나 0행',
      observed: '미실행: anon 키 요청은 보내지 않음. SQL Editor 확인 표로 RLS 켜짐·정책 0·anon 권한 없음만 확인' },
  ];
}

// 4단계: 3단계의 무로그인·위조 신원 요청에 더해, 실제 B 메모 id와 남의 owner_id를 실은 무로그인 요청을 보냅니다.
// A·B 로그인 토큰으로 상대 메모에 접근하는 요청은 이 점검이 보내지 않으므로 미실행으로 남깁니다.
async function runStep4Checks(config, app, staticResponse, staticText) {
  const base = await runStep3Checks(config, app, staticResponse, staticText);
  const keep = base.filter(item => !['login_a_crud', 'login_b_other_note', 'supabase_anon_notes_read'].includes(item.attackId));
  const api = (path, init = {}) => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000), ...init });
  const bNote = '/api/notes/b0b0b0b0-0000-4000-8000-000000000004';
  const forgedOwner = '00000000-0000-4000-8000-000000000001';
  const read = await api(`${bNote}?owner_id=${forgedOwner}`);
  const change = await api(bNote, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-user-id': forgedOwner },
    body: JSON.stringify({ title: '점검용', body: '소유자 변경 시도', owner_id: forgedOwner }),
  });
  const remove = await api(bNote, { method: 'DELETE', headers: { 'x-user-id': forgedOwner } });
  return [
    ...keep,
    { attackId: 'anonymous_known_note_access', expected: '실제 메모 id에 owner_id를 위조해 보낸 무로그인 GET·PUT·DELETE는 모두 401',
      observed: `B 시험 메모 id로 무로그인 GET ${read.status}, owner_id 바꾼 PUT ${change.status}, DELETE ${remove.status}` },
    { attackId: 'login_own_crud', expected: 'A·B 각자 자기 메모 읽기·추가·수정·삭제 성공',
      observed: '미실행: 이 점검은 A·B 로그인 토큰을 쓰지 않음. 화면에서 학생이 직접 확인' },
    { attackId: 'login_b_other_note', expected: 'B 로그인으로 A 메모 GET·PUT·DELETE는 모두 404, A 메모 그대로',
      observed: '미실행: 이 점검은 B 로그인 토큰을 쓰지 않음' },
    { attackId: 'login_owner_change', expected: '본인 메모 PUT 본문에 남의 owner_id를 넣으면 403 OWNER_CHANGE_FORBIDDEN',
      observed: '미실행: 이 점검은 로그인 토큰을 쓰지 않음' },
    { attackId: 'db_rls_owner_policies', expected: 'notes 테이블 authenticated는 SELECT·INSERT·UPDATE·DELETE만, 행은 auth.uid()=owner_id만',
      observed: '미실행: RLS·최소 권한 SQL은 제안만 하고 아직 적용하지 않음 (현재 authenticated 권한 없음, 정책 0개)' },
    { attackId: 'supabase_anon_notes_read', expected: 'anon 키로 notes 테이블 읽기 요청이 거부되거나 0행',
      observed: '미실행: anon 키 요청은 보내지 않음. DB 조회로 anon 권한 없음만 확인' },
  ];
}
