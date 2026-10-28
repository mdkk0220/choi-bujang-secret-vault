// /api/notes/:id — GET: 한 건 {id, title, body}, PUT: 수정, DELETE: 삭제(뒤이은 GET은 404).
// 아직 소유자 검사는 없습니다(4단계에서 고칠 허점). 로그인 확인과 처리는 src/notes-api.mjs에 있습니다.
import { handleNotes } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  const id = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  return handleNotes(request, response, typeof id === 'string' ? id : '');
}
