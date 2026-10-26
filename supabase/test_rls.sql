-- Teste das regras de acesso. Roda em um Postgres comum com um "auth" simulado
-- (no Supabase real essas peças já existem). Cada bloco imprime PASSA ou FALHA.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

-- ---- simulação do que o Supabase já fornece
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

\ir schema.sql

-- ---- ajudantes de teste
create table public.resultado (nome text, ok boolean);
grant all on public.resultado to public;
create function public.eu(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then set role anon; else set role authenticated; end if;
end $$;
create function public.sou_superusuario() returns void language sql as $$ reset role $$;
grant execute on function public.eu(uuid), public.sou_superusuario() to public;

-- ---- contas: A (empresa Alfa) e B (empresa Beta) se cadastram sozinhas
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@alfa.com',  now(), '{"empresa":"Alfa"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bia@beta.com',  now(), '{"empresa":"Beta"}');

select 'cada cadastro cria sua empresa e o admin: ' ||
  case when (select count(*) from public.empresas) = 2
        and (select count(*) from public.membros where papel='admin') = 2
        and (select count(*) from public.config) = 2 then 'PASSA' else 'FALHA' end;

-- ids conhecidos pelo "invasor" (um id de empresa alheia pode vazar por outros meios)
create table public.ids as select nome, id from public.empresas;
grant select on public.ids to public;

-- ---- Ana (admin Alfa) grava dados
select public.eu('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.config (empresa_id, dados)
  values (public.minha_empresa(), '{"alojamentos":[1]}')
  on conflict (empresa_id) do update set dados = excluded.dados;
insert into public.pedidos (empresa_id, data, dados)
  values (public.minha_empresa(), '2026-10-23', '{"cafe":{}}');
select 'admin grava config e pedido: ' ||
  case when (select count(*) from public.pedidos) = 1 then 'PASSA' else 'FALHA' end;

-- ---- Bia (admin Beta) não enxerga nada da Alfa e não consegue escrever lá
select public.eu('bbbbbbbb-0000-0000-0000-000000000001');
select 'outra empresa não lê pedidos da Alfa: ' ||
  case when (select count(*) from public.pedidos) = 0 then 'PASSA' else 'FALHA' end;
select 'outra empresa não lê config da Alfa: ' ||
  case when (select dados from public.config) = '{}'::jsonb then 'PASSA' else 'FALHA' end;
select 'outra empresa não lê membros da Alfa: ' ||
  case when (select count(*) from public.membros) = 1 then 'PASSA' else 'FALHA' end;
do $$ begin
  begin
    insert into public.pedidos (empresa_id, data, dados)
      values ((select id from public.ids where nome = 'Alfa'), '2026-10-24', '{}');
    raise notice 'invasão escrita em outra empresa: FALHA';
  exception when others then raise notice 'não escreve em outra empresa (%): PASSA', sqlerrm; end;
end $$;
-- tentativa de alterar a empresa alheia: nenhuma linha é afetada
update public.pedidos set dados = '{"hack":1}';
update public.config set dados = '{"hack":1}' where empresa_id <> public.minha_empresa();
select public.sou_superusuario();
select 'dados da Alfa continuam intactos: ' ||
  case when (select dados from public.config where empresa_id = (select id from public.empresas where nome='Alfa')) = '{"alojamentos":[1]}'::jsonb
        and (select dados from public.pedidos limit 1) = '{"cafe":{}}'::jsonb then 'PASSA' else 'FALHA' end;

-- ---- anônimo (sem login) não vê nada
select public.eu(null);
do $$ begin
  begin
    perform count(*) from public.pedidos;
    raise notice 'anônimo lê pedidos: FALHA';
  exception when others then raise notice 'anônimo sem acesso (%): PASSA', sqlerrm; end;
end $$;
select public.sou_superusuario();

-- ---- Ana convida Caio (operador) e Dani (admin)
select public.eu('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.convites (empresa_id, email, papel)
  values (public.minha_empresa(), 'caio@alfa.com', 'operador'),
         (public.minha_empresa(), 'dani@alfa.com', 'admin');
select 'admin vê os convites: ' || case when (select count(*) from public.convites) = 2 then 'PASSA' else 'FALHA' end;
select public.sou_superusuario();

-- Bia não vê nem cria convites para a Alfa
select public.eu('bbbbbbbb-0000-0000-0000-000000000001');
select 'outra empresa não vê convites da Alfa: ' || case when (select count(*) from public.convites) = 0 then 'PASSA' else 'FALHA' end;
do $$ begin
  begin
    insert into public.convites (empresa_id, email, papel)
      values ((select id from public.ids where nome = 'Alfa'), 'bia@alfa.com', 'admin');
    raise notice 'convite em empresa alheia: FALHA';
  exception when others then raise notice 'não cria convite em empresa alheia: PASSA'; end;
end $$;
select public.sou_superusuario();

-- ---- Caio e Dani se cadastram: como foram convidados, NÃO ganham empresa própria
insert into auth.users (id, email, email_confirmed_at) values
  ('cccccccc-0000-0000-0000-000000000001', 'caio@alfa.com', null),
  ('dddddddd-0000-0000-0000-000000000001', 'DANI@alfa.com', now());
select 'convidado não cria empresa própria: ' ||
  case when (select count(*) from public.empresas) = 2 then 'PASSA' else 'FALHA' end;

-- Caio ainda não confirmou o e-mail: entrar() não o coloca na empresa
select public.eu('cccccccc-0000-0000-0000-000000000001');
select public.entrar();
select public.sou_superusuario();
select 'e-mail não confirmado não entra: ' ||
  case when not exists (select 1 from public.membros where user_id = 'cccccccc-0000-0000-0000-000000000001') then 'PASSA' else 'FALHA' end;

-- depois de confirmar, entra como operador
update auth.users set email_confirmed_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
select public.eu('cccccccc-0000-0000-0000-000000000001');
select public.entrar();
select public.sou_superusuario();
select 'após confirmar, entra como operador: ' ||
  case when (select papel from public.membros where user_id='cccccccc-0000-0000-0000-000000000001') = 'operador' then 'PASSA' else 'FALHA' end;
select 'convite usado some: ' ||
  case when (select count(*) from public.convites where lower(email)='caio@alfa.com') = 0 then 'PASSA' else 'FALHA' end;

-- Dani (e-mail com maiúsculas) entra como admin
select public.eu('dddddddd-0000-0000-0000-000000000001');
select public.entrar();
select public.sou_superusuario();
select 'convite ignora maiúsculas e vale admin: ' ||
  case when (select papel from public.membros where user_id='dddddddd-0000-0000-0000-000000000001') = 'admin' then 'PASSA' else 'FALHA' end;

-- ---- Caio (operador): lê e escreve pedidos, mas não altera cadastros nem equipe
select public.eu('cccccccc-0000-0000-0000-000000000001');
select 'operador lê os pedidos da empresa: ' || case when (select count(*) from public.pedidos) = 1 then 'PASSA' else 'FALHA' end;
insert into public.pedidos (empresa_id, data, dados)
  values (public.minha_empresa(), '2026-10-25', '{"jantar":{}}');
update public.pedidos set dados = '{"cafe":{"editado":1}}' where data = '2026-10-23';
select 'operador cria e altera pedidos: ' ||
  case when (select count(*) from public.pedidos) = 2
        and (select dados from public.pedidos where data='2026-10-23') = '{"cafe":{"editado":1}}'::jsonb then 'PASSA' else 'FALHA' end;
do $$ begin
  begin
    update public.config set dados = '{"hack":1}';
    if (select dados from public.config) = '{"hack":1}'::jsonb then
      raise notice 'operador alterou config: FALHA';
    else
      raise notice 'operador não altera config (0 linhas): PASSA';
    end if;
  exception when others then raise notice 'operador não altera config (%): PASSA', sqlerrm; end;
end $$;
do $$ begin
  begin
    insert into public.convites (empresa_id, email, papel) values (public.minha_empresa(), 'x@alfa.com', 'admin');
    raise notice 'operador criou convite: FALHA';
  exception when others then raise notice 'operador não cria convite: PASSA'; end;
end $$;
select 'operador não vê convites: ' || case when (select count(*) from public.convites) = 0 then 'PASSA' else 'FALHA' end;
delete from public.membros where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.sou_superusuario();
select 'operador não remove ninguém: ' ||
  case when exists (select 1 from public.membros where user_id='aaaaaaaa-0000-0000-0000-000000000001') then 'PASSA' else 'FALHA' end;

-- ---- Ana (admin): altera config, remove o Caio, mas não remove a si mesma
select public.eu('aaaaaaaa-0000-0000-0000-000000000001');
update public.config set dados = '{"alojamentos":[1,2]}';
delete from public.membros where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.membros where user_id = 'cccccccc-0000-0000-0000-000000000001';
select public.sou_superusuario();
select 'admin altera config: ' ||
  case when (select dados from public.config where empresa_id=(select id from public.empresas where nome='Alfa')) = '{"alojamentos":[1,2]}'::jsonb then 'PASSA' else 'FALHA' end;
select 'admin não remove a si mesmo: ' ||
  case when exists (select 1 from public.membros where user_id='aaaaaaaa-0000-0000-0000-000000000001') then 'PASSA' else 'FALHA' end;
select 'admin remove outro membro: ' ||
  case when not exists (select 1 from public.membros where user_id='cccccccc-0000-0000-0000-000000000001') then 'PASSA' else 'FALHA' end;

-- ---- membro removido perde o acesso
select public.eu('cccccccc-0000-0000-0000-000000000001');
select 'removido não lê mais pedidos: ' || case when (select count(*) from public.pedidos) = 0 then 'PASSA' else 'FALHA' end;
select public.sou_superusuario();

-- ---- ninguém se coloca em empresa alheia por conta própria
select public.eu('bbbbbbbb-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.membros (empresa_id, user_id, email, papel)
      values ((select id from public.ids where nome = 'Alfa'), 'bbbbbbbb-0000-0000-0000-000000000001', 'bia@beta.com', 'admin');
    raise notice 'auto-inclusão em empresa alheia: FALHA';
  exception when others then raise notice 'não entra sozinha em empresa alheia: PASSA'; end;
end $$;
