// 2단계 서버 함수: 학습용 Supabase notes 테이블에서 가상 메모를 읽어 화면에 돌려줍니다.
// 서버 전용 키는 Vercel 환경변수(SUPABASE_URL, SUPABASE_SECRET_KEY)에서만 읽고, 응답·로그에 내보내지 않습니다.
// 로그인은 아직 없습니다. 3단계에서 로그인 확인을 추가합니다.
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return response.status(503).json({ error: 'NOTES_NOT_CONFIGURED' });
  }
  try {
    const supabase = createClient(url, secretKey, {
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
