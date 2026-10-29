-- 상태: 적용하지 않음. 5단계에서 직접 권한을 모두 거두기로 해 이 제안은 쓰지 않습니다(authenticated에 권한을 주므로 실행 금지).
-- 적용은 학생이 검토한 뒤 SQL Editor에서 직접 실행합니다.
-- BYTE BACK 방어전 4단계: 메모 테이블(public.notes) RLS와 최소 권한. 학습용 제안 SQL입니다.
-- 다른 테이블은 건드리지 않습니다. 키·이메일·메모 본문은 들어 있지 않습니다.
-- Supabase SQL Editor에 전체를 붙여넣고 Run 한 번. 여러 번 실행해도 결과가 같습니다.
-- 마지막 결과 표 하나에 적용 전·후 권한이 나란히 나옵니다.

-- 0) 세 역할의 표 권한을 보여 주는 임시 보기 (이 실행 창에서만 존재)
create or replace temp view step4_priv as
select r.role,
  (select coalesce(string_agg(g.privilege_type, ', ' order by g.privilege_type), '없음')
     from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'notes'
      and g.grantee = r.role)                                        as grants,
  coalesce(nullif(concat_ws(', ',
    case when has_table_privilege(r.check_as, 'public.notes', 'SELECT')     then 'SELECT' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'INSERT')     then 'INSERT' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'UPDATE')     then 'UPDATE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'DELETE')     then 'DELETE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'TRUNCATE')   then 'TRUNCATE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'REFERENCES') then 'REFERENCES' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'TRIGGER')    then 'TRIGGER' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'MAINTAIN')   then 'MAINTAIN' end
  ), ''), '없음')                                                     as effective
from (values ('anon', 'anon'), ('authenticated', 'authenticated'), ('PUBLIC', 'public')) r(role, check_as);

-- 1) 적용 전 기록
drop table if exists step4_before;
create temp table step4_before as select * from step4_priv;

-- 2) 적용
begin;

-- 기존 권한을 모두 회수
revoke all on table public.notes from public, anon, authenticated;

-- 로그인 사용자에게 필요한 네 가지만 부여 (TRUNCATE·REFERENCES·TRIGGER·MAINTAIN 없음)
grant select, insert, update, delete on table public.notes to authenticated;

alter table public.notes enable row level security;

-- 같은 이름의 정책이 있으면 바꿔 끼웁니다. 다른 정책은 건드리지 않습니다.
drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

-- SELECT: 기존 행의 주인만 (USING)
create policy notes_select_own on public.notes
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- INSERT: 새 행의 주인이 본인일 때만 (WITH CHECK)
create policy notes_insert_own on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- UPDATE: 기존 행의 주인이 본인이고 (USING), 고친 새 행의 주인도 본인일 때만 (WITH CHECK)
create policy notes_update_own on public.notes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- DELETE: 기존 행의 주인만 (USING)
create policy notes_delete_own on public.notes
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

commit;

-- 3) 적용 전·후 대조 (마지막 결과 표)
select a.role,
       b.grants    as before_grants,
       b.effective as before_effective,
       a.grants    as after_grants,
       a.effective as after_effective,
       (select relrowsecurity from pg_class where oid = 'public.notes'::regclass) as rls_on,
       (select string_agg(policyname || ':' || cmd, ', ' order by policyname)
          from pg_policies where schemaname = 'public' and tablename = 'notes') as policies
from step4_priv a
join step4_before b using (role)
order by case a.role when 'anon' then 1 when 'authenticated' then 2 else 3 end;
