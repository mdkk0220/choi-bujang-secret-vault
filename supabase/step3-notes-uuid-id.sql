-- 3단계: 메모 API가 쓰는 UUID 식별자 (2026-10-28 Supabase에 적용함, 기록용 사본).
-- 기존 숫자 id·행은 그대로 둡니다. 메모 본문·키는 들어 있지 않습니다.
alter table public.notes
  add column if not exists note_id uuid not null default gen_random_uuid();
create unique index if not exists notes_note_id_key on public.notes (note_id);
create index if not exists notes_owner_id_idx on public.notes (owner_id);
-- 새 칸도 anon·authenticated에는 권한이 없습니다(테이블 권한 회수 유지).
revoke all on table public.notes from anon, authenticated;
