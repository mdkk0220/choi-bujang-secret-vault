-- 4단계 준비: 기존 가상 메모 네 건(id 1~4)을 A 소유로, B 소유 공개 가능한 시험 메모 한 건 추가.
-- 2026-10-29 Supabase에 적용함(기록용 사본). 이메일·키·메모 본문은 넣지 않았습니다.
-- 실제 적용 때는 auth.users의 두 계정 중 A·B를 각각 하나로 특정해 :a_id, :b_id로 썼습니다.
-- API·RLS·권한은 이 SQL에서 바꾸지 않았습니다.
update public.notes set owner_id = :a_id where id between 1 and 4 and owner_id is null;
insert into public.notes (note_id, owner_id, title, content)
values ('b0b0b0b0-0000-4000-8000-000000000004', :b_id,
        'B 시험 메모', '4단계 소유자 검사 시험용으로 만든 공개 가능한 가상 기록')
on conflict (note_id) do nothing;
-- 적용 결과: A 4건(행 1~4), B 1건(행 9), 소유자 없는 메모 0건
