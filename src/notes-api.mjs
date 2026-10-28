// 3단계 메모 API 공통 처리. api/notes.js(목록·추가)와 api/notes/[id].js(한 건 조회·수정·삭제)가 함께 씁니다.
// 로그인 여부는 시작 틀의 src/verify-login.mjs가 확인한 사용자 ID로만 판단합니다.
// 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다. 추가할 때 owner_id는 서버가 확인한 ID로 저장합니다.
// 아직 소유자 검사는 하지 않습니다: 로그인한 누구나 id로 남의 메모를 조회·수정·삭제할 수 있습니다(4단계에서 고칠 허점).
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
      const { data, error } = await notes().select(COLUMNS).eq('note_id', key).maybeSingle();
      if (error) throw error;
      return data ? send(response, 200, toNote(data)) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
    }

    if (method === 'PUT') {
      const input = readBody(request);
      if (!input) return send(response, 400, { error: 'INVALID_JSON' });
      if (!validText(input.title, TITLE_MAX, false) || !validText(input.body, BODY_MAX, true)) {
        return send(response, 400, { error: 'INVALID_NOTE' });
      }
      const { data, error } = await notes().update({ title: input.title, content: input.body })
        .eq('note_id', key).select(COLUMNS).maybeSingle();
      if (error) throw error;
      return data ? send(response, 200, toNote(data)) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
    }

    const { data, error } = await notes().delete().eq('note_id', key).select('note_id');
    if (error) throw error;
    return data.length ? send(response, 204) : send(response, 404, { error: 'NOTE_NOT_FOUND' });
  } catch {
    return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
  }
}
