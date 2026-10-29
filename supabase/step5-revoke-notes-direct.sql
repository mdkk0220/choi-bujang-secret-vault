-- 상태: 제안 SQL(학생이 검토·실행). 2026-10-29 DB 조회 결과 세 역할 직접 권한은 이미 없음.
-- BYTE BACK 방어전 5단계: 학습용 메모 테이블(public.notes)의 직접 권한 회수. 학습용 제안 SQL입니다.
-- 대상은 PUBLIC·anon·authenticated의 직접 권한뿐입니다. 표·열·이 표의 번호(시퀀스) 권한을 거둡니다.
-- 바꾸지 않는 것: 다른 테이블, RLS 켜짐 상태, 정책, postgres·service_role 권한(서버 함수가 쓰는 서버 전용 키).
-- 키·이메일·메모 본문은 들어 있지 않습니다.
-- Supabase SQL Editor에 전체를 붙여넣고 Run 한 번. 여러 번 실행해도 결과가 같습니다.
-- 마지막 결과 표 하나에 적용 전·후 권한이 나란히 나옵니다.
-- 주의: 4단계에 제안한 step4-notes-rls.sql은 authenticated에 권한을 주므로, 이 SQL과 함께 실행하지 마세요.

-- 0) 세 역할의 직접 권한을 보여 주는 임시 보기 (이 실행 창에서만 존재)
create or replace temp view step5_priv as
select r.role,
  -- information_schema.role_table_grants: 표에 부여된 권한 목록
  (select coalesce(string_agg(g.privilege_type, ', ' order by g.privilege_type), '없음')
     from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'notes' and g.grantee = r.role) as table_grants,
  -- has_table_privilege: 실제로 쓸 수 있는 표 권한(상속 포함)
  coalesce(nullif(concat_ws(', ',
    case when has_table_privilege(r.check_as, 'public.notes', 'SELECT')     then 'SELECT' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'INSERT')     then 'INSERT' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'UPDATE')     then 'UPDATE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'DELETE')     then 'DELETE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'TRUNCATE')   then 'TRUNCATE' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'REFERENCES') then 'REFERENCES' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'TRIGGER')    then 'TRIGGER' end,
    case when has_table_privilege(r.check_as, 'public.notes', 'MAINTAIN')   then 'MAINTAIN' end
  ), ''), '없음') as table_effective,
  -- 열 단위로 따로 부여된 권한
  (select coalesce(string_agg(distinct c.privilege_type || '(' || c.column_name || ')', ', '), '없음')
     from information_schema.column_privileges c
    where c.table_schema = 'public' and c.table_name = 'notes' and c.grantee = r.role) as column_grants,
  -- 이 표의 번호 시퀀스 권한
  coalesce(nullif(concat_ws(', ',
    case when has_sequence_privilege(r.check_as, pg_get_serial_sequence('public.notes', 'id'), 'USAGE')  then 'USAGE' end,
    case when has_sequence_privilege(r.check_as, pg_get_serial_sequence('public.notes', 'id'), 'SELECT') then 'SELECT' end,
    case when has_sequence_privilege(r.check_as, pg_get_serial_sequence('public.notes', 'id'), 'UPDATE') then 'UPDATE' end
  ), ''), '없음') as sequence_effective
from (values ('PUBLIC', 'public'), ('anon', 'anon'), ('authenticated', 'authenticated')) r(role, check_as);

-- 1) 적용 전 기록
drop table if exists step5_before;
create temp table step5_before as select * from step5_priv;

-- 2) 적용
begin;

-- 표 권한 회수
revoke all on table public.notes from public, anon, authenticated;

-- 열 단위 권한 회수 (표 권한 회수로는 열 단위 부여가 지워지지 않음)
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = 'public.notes'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all (%s) on table public.notes from public, anon, authenticated', cols);
end $$;

-- 이 표의 번호 시퀀스 권한 회수 (다른 시퀀스는 건드리지 않음)
do $$
declare seq text := pg_get_serial_sequence('public.notes', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
  end if;
end $$;

-- RLS는 켜 둔 채로 유지 (이미 켜져 있으면 변화 없음)
alter table public.notes enable row level security;

commit;

-- 3) 적용 전·후 대조 (마지막 결과 표)
select a.role,
       b.table_grants       as before_table_grants,
       b.table_effective    as before_table_effective,
       a.table_grants       as after_table_grants,
       a.table_effective    as after_table_effective,
       a.column_grants      as after_column_grants,
       a.sequence_effective as after_sequence,
       (select relrowsecurity from pg_class where oid = 'public.notes'::regclass) as rls_on,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'notes'
           and grantee = 'service_role') as service_role_kept
from step5_priv a
join step5_before b using (role)
order by case a.role when 'PUBLIC' then 1 when 'anon' then 2 else 3 end;

-- 4) (선택) 적용 후 따로 실행: anon·authenticated로 직접 읽기를 흉내 내 봅니다.
--    아래 두 줄을 각각 따로 Run 하면 "permission denied for table notes" 오류가 나와야 정상입니다.
-- begin; set local role anon;          select count(*) from public.notes; rollback;
-- begin; set local role authenticated; select count(*) from public.notes; rollback;
