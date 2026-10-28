// /api/notes — GET: 로그인 사용자의 메모 목록, POST: 메모 추가 ({id?, title, body} → {id}).
// 로그인 확인과 처리는 src/notes-api.mjs에 있습니다.
import { handleNotes } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return handleNotes(request, response, undefined);
}
