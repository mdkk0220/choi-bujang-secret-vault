// 3단계 자료 API: 시작 틀의 src/verify-login.mjs로 요청 토큰을 검사한 뒤에만 가상 메모를 돌려줍니다.
// 판단 근거는 Authorization: Bearer 토큰 하나뿐입니다. 브라우저가 보낸 userId·role·쿼리·본문은 읽지 않습니다.
// 서버 전용 키는 Vercel 환경변수(SUPABASE_SECRET_KEY)에서만 읽고, 응답·로그에 내보내지 않습니다.
// 자료 테이블은 로그인 발급자와 같은 Supabase 프로젝트에 있으므로 주소는 aleph.config.json의 발급자에서 가져옵니다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const projectUrl = new URL(config.identityProvider.issuer).origin;
let verifier;

function getVerifier(secretKey) {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
  return verifier;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return response.status(503).json({ error: 'NOTES_NOT_CONFIGURED' });
  }

  let login;
  try {
    login = await getVerifier(secretKey)(request.headers?.authorization);
  } catch {
    login = null;
  }
  if (!login) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }

  try {
    const supabase = createClient(projectUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase
      .from('notes')
      .select('title, content')
      .order('id', { ascending: true })
      .limit(50);
    if (error) throw error;
    return response.status(200).json({ notes: data ?? [] });
  } catch {
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
