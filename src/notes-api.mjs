// 메모 API 공통 처리. api/notes.js(목록·추가)와 api/notes/[id].js(한 건 조회·수정·삭제)가 함께 씁니다.
// 로그인 여부와 사용자 ID는 시작 틀의 src/verify-login.mjs가 토큰에서 확인한 값만 씁니다.
// 4단계 소유자 검사: 모든 읽기·수정·삭제는 DB의 owner_id가 확인된 사용자 ID와 같은 행만 대상으로 합니다.
// URL·쿼리·본문의 owner_id·userId는 믿지 않습니다. 추가할 때 owner_id는 확인된 ID로 저장합니다.
// 남의 메모는 존재 여부를 알려 주지 않도록 없는 메모와 똑같이 404로 답합니다.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const projectUrl = new URL(config.identityProvider.issuer).origin;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 200;
const BODY_MAX = 5000;
const COLUMNS = 'note_id, title, content';
const OWNED_COLUMNS = 'note_id, title, content, owner_id';

let verifier;
let database;

const toNote = row => ({ id: row.note_id, title: row.title, body: row.content });
const send = (response, status, payload) => (payload === undefined
  ? response.status(status).end() : response.status(status).json(payload));

function readBody(request) {
  const raw = request.body;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

// 본문에 owner_id(또는 ownerId)가 들어 있으면 확인된 사용자 ID와 같아야 합니다. 다르면 소유자 변경 시도입니다.
function ownerChangeAttempt(input, userId) {
  for (const key of ['owner_id', 'ownerId']) {
    if (Object.hasOwn(input, key) && input[key] !== userId) return true;
  }
  return false;
}

function validText(value, max, allowEmpty) {
  return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0);
}

export async function handleNotes(request, response, id) {
  response.setHeader('Cache-Control', 'no-store');
  const method = request.method;
  const allowed = id === undefined ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(method)) {
    response.setHeader('Allow', allowed.join(', '));
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return send(response, 503, { error: 'NOTES_NOT_CONFIGURED' });

  let login = null;
  try {
    verifier ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    login = await verifier(request.headers?.authorization);
  } catch {
    login = null;
  }
  if (!login?.userId) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    return send(response, 401, { error: 'LOGIN_REQUIRED' });
  }

  if (id !== undefined && (typeof id !== 'string' || !UUID.test(id))) {
    return send(response, 400, { error: 'INVALID_NOTE_ID' });
  }

  database ??= createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const notes = () => database.from('notes');

  try {
    if (id === undefined && method === 'GET') {
      const { data, error } = await notes().select(COLUMNS)
        .eq('owner_id', login.userId).order('created_at', { ascending: true }).limit(200);
      if (error) throw error;
      return send(response, 200, data.map(toNote));
    }

    if (id === undefined && method === 'POST') {
      const input = readBody(request);
      if (!input) return send(response, 400, { error: 'INVALID_JSON' });
      const noteId = input.id === undefined || input.id === null ? randomUUID() : input.id;
      if (typeof noteId !== 'string' || !UUID.test(noteId)) return send(response, 400, { error: 'INVALID_NOTE_ID' });
      if (!validText(input.title, TITLE_MAX, false) || !validText(input.body, BODY_MAX, true)) {
        return send(response, 400, { error: 'INVALID_NOTE' });
      }
      const { error } = await notes().insert({
        note_id: noteId.toLowerCase(), title: input.title, content: input.body, owner_id: login.userId,
      });
      if (error?.code === '23505') return send(response, 409, { error: 'NOTE_ID_EXISTS' });
      if (error) throw error;
      return send(response, 201, { id: noteId.toLowerCase() });
    }

    const key = id.toLowerCase();
    if (method === 'GET') {
      const { data, error } = await notes().select(COLUMNS)
        .eq('note_id', key).eq('owner_id', login.userId).maybeSingle();
      if (error) throw error;
      return data ? send(response, 200, toNote(data)) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
    }

    if (method === 'PUT') {
      const input = readBody(request);
      if (!input) return send(response, 400, { error: 'INVALID_JSON' });
      if (ownerChangeAttempt(input, login.userId)) return send(response, 403, { error: 'OWNER_CHANGE_FORBIDDEN' });
      if (input.id !== undefined && (typeof input.id !== 'string' || input.id.toLowerCase() !== key)) {
        return send(response, 400, { error: 'NOTE_ID_MISMATCH' });
      }
      if (!validText(input.title, TITLE_MAX, false) || !validText(input.body, BODY_MAX, true)) {
        return send(response, 400, { error: 'INVALID_NOTE' });
      }
      // 기존 행: 본인 소유인 행만 고칩니다. 새 행: owner_id를 확인된 ID로 다시 적고, 결과도 본인 소유인지 확인합니다.
      const { data, error } = await notes()
        .update({ title: input.title, content: input.body, owner_id: login.userId })
        .eq('note_id', key).eq('owner_id', login.userId).select(OWNED_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) return send(response, 404, { error: 'NOTE_NOT_FOUND' });
      if (data.owner_id !== login.userId) return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
      return send(response, 200, toNote(data));
    }

    const { data, error } = await notes().delete()
      .eq('note_id', key).eq('owner_id', login.userId).select('note_id');
    if (error) throw error;
    return data.length ? send(response, 204) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
  } catch {
    return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
  }
}
