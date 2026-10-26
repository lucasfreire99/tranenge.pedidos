-- Rancho Pedidos: esquema multiempresa para Supabase.
-- Como usar: abra o projeto no Supabase, vá em SQL Editor, cole este arquivo
-- inteiro e execute uma vez.
--
-- Ideia central: cada empresa é um "inquilino". Toda linha de dados leva o
-- empresa_id e o banco (Row Level Security) só devolve linhas da empresa da
-- pessoa logada. Isso vale mesmo que alguém altere o código do app.

-- ---------------------------------------------------------------- tabelas

create table public.empresas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null default 'Minha empresa',
  criado_em timestamptz not null default now()
);

-- Quem pertence a qual empresa e com qual papel.
-- Neste primeiro modelo cada pessoa pertence a uma única empresa.
create table public.membros (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  papel      text not null check (papel in ('admin', 'operador')),
  criado_em  timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create unique index membros_um_por_usuario on public.membros (user_id);

-- Convites feitos por um administrador, por e-mail.
create table public.convites (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email      text not null,
  papel      text not null default 'operador' check (papel in ('admin', 'operador')),
  criado_em  timestamptz not null default now(),
  unique (empresa_id, email)
);
create index convites_email on public.convites (lower(email));

-- Cadastros da empresa (alojamentos, frentes de obra, empresas clientes).
create table public.config (
  empresa_id    uuid primary key references public.empresas(id) on delete cascade,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Um registro por empresa e por dia, com café, almoço e jantar dentro de "dados".
create table public.pedidos (
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  data          date not null,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, data)
);

create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger config_toca  before update on public.config
  for each row execute function public.tocar_atualizado_em();
create trigger pedidos_toca before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

-- --------------------------------------------------------------- funções

-- Empresa e papel da pessoa logada. Usadas nas regras de acesso.
create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.membros where user_id = auth.uid() limit 1
$$;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.membros where user_id = auth.uid() limit 1
$$;

-- Ao criar uma conta nova: se o e-mail NÃO foi convidado por ninguém, cria uma
-- empresa nova e torna a pessoa administradora dela. Se foi convidado, não cria
-- nada: a entrada na empresa acontece em entrar(), depois da confirmação do e-mail.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
begin
  if exists (select 1 from public.convites where lower(email) = lower(new.email)) then
    return new;
  end if;

  insert into public.empresas (nome)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'empresa'), ''), 'Minha empresa'))
  returning id into v_empresa;

  insert into public.membros (empresa_id, user_id, email, papel)
  values (v_empresa, new.id, new.email, 'admin');

  insert into public.config (empresa_id) values (v_empresa);
  return new;
end $$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- Chamada pelo app logo após o login. Se a pessoa ainda não tem empresa e o
-- e-mail dela (já confirmado) foi convidado, coloca a pessoa na empresa.
create or replace function public.entrar() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_convite public.convites;
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.membros where user_id = auth.uid()) then return; end if;

  select email into v_email
    from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return; end if;

  select * into v_convite
    from public.convites
   where lower(email) = lower(v_email)
   order by criado_em
   limit 1;
  if v_convite.id is null then return; end if;

  insert into public.membros (empresa_id, user_id, email, papel)
  values (v_convite.empresa_id, auth.uid(), v_email, v_convite.papel);

  delete from public.convites where lower(email) = lower(v_email);
end $$;

revoke all on function public.minha_empresa() from public, anon;
revoke all on function public.meu_papel()     from public, anon;
revoke all on function public.entrar()        from public, anon;
grant execute on function public.minha_empresa() to authenticated;
grant execute on function public.meu_papel()     to authenticated;
grant execute on function public.entrar()        to authenticated;

-- ------------------------------------------------- regras de acesso (RLS)

alter table public.empresas enable row level security;
alter table public.membros  enable row level security;
alter table public.convites enable row level security;
alter table public.config   enable row level security;
alter table public.pedidos  enable row level security;

revoke all on all tables in schema public from anon;

-- Empresa: todos da empresa veem; só administradores renomeiam.
create policy empresas_ver on public.empresas for select to authenticated
  using (id = (select public.minha_empresa()));
create policy empresas_renomear on public.empresas for update to authenticated
  using (id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin')
  with check (id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin');

-- Equipe: todos veem quem é da empresa; só administradores removem (nunca a si mesmos).
-- Não há regra de insert: entrar na empresa só acontece pelas funções acima.
create policy membros_ver on public.membros for select to authenticated
  using (empresa_id = (select public.minha_empresa()));
create policy membros_remover on public.membros for delete to authenticated
  using (empresa_id = (select public.minha_empresa())
         and (select public.meu_papel()) = 'admin'
         and user_id <> auth.uid());

-- Convites: só administradores veem e gerenciam.
create policy convites_admin on public.convites for all to authenticated
  using (empresa_id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin')
  with check (empresa_id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin');

-- Cadastros: todos da empresa leem; só administradores alteram.
create policy config_ver on public.config for select to authenticated
  using (empresa_id = (select public.minha_empresa()));
create policy config_inserir on public.config for insert to authenticated
  with check (empresa_id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin');
create policy config_alterar on public.config for update to authenticated
  using (empresa_id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin')
  with check (empresa_id = (select public.minha_empresa()) and (select public.meu_papel()) = 'admin');

-- Pedidos: administradores e operadores leem, criam, alteram e apagam.
create policy pedidos_ver on public.pedidos for select to authenticated
  using (empresa_id = (select public.minha_empresa()));
create policy pedidos_inserir on public.pedidos for insert to authenticated
  with check (empresa_id = (select public.minha_empresa()));
create policy pedidos_alterar on public.pedidos for update to authenticated
  using (empresa_id = (select public.minha_empresa()))
  with check (empresa_id = (select public.minha_empresa()));
create policy pedidos_apagar on public.pedidos for delete to authenticated
  using (empresa_id = (select public.minha_empresa()));

-- Atualização ao vivo entre aparelhos (respeita as regras acima).
alter publication supabase_realtime add table public.pedidos, public.config;
