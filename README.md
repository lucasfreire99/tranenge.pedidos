# Rancho Pedidos

Monta o pedido de marmitas (café, almoço e jantar) por alojamento e frente de obra
e gera o texto pronto para colar no WhatsApp. Tem cadastros, histórico, relatório
mensal, marcação manual de envio por local ("última atualização"), backup, tema claro/escuro, instalação como app e, quando ligado ao
Supabase, login por e-mail e senha com várias empresas e equipe.

## Dois modos

- **Sem login (padrão).** Com `js/config.js` vazio, tudo é salvo no navegador do
  aparelho. Bom para testar e para uso individual.
- **Com login (SaaS).** Com `js/config.js` preenchido, o app pede e-mail e senha,
  guarda os dados no Supabase e separa os dados de cada empresa.
  Guia completo: [`docs/LOGIN.md`](docs/LOGIN.md).

## Estrutura

```
index.html          página principal
sw.js               service worker (uso offline; só fora do Claude)
css/
  tokens.css        cores e fontes, tema claro e escuro
  styles.css        layout e componentes
js/
  config.js         endereço e chave pública do Supabase (editar ao publicar)
  logic.js          regras puras: ler mensagem, totais, texto do WhatsApp, relatório, backup
  util.js           aviso rápido, copiar, confirmação em dois cliques, localStorage
  cloud.js          login, empresa, equipe e dados no Supabase
  store.js          estado, pedidos do dia e gravação (nuvem, aparelho ou Claude)
  theme.js          botão de tema
  pwa.js            instalar como app (manifest e ícones gerados no navegador)
  backup.js         exportar e restaurar backup (.json)
  views.js          telas do app
  cloudviews.js     telas de login e gestão de equipe
  actions.js        cliques, digitação e formulários
  main.js           ponto de entrada
supabase/
  schema.sql        tabelas, regras de acesso e funções (rodar uma vez no Supabase)
  test_rls.sql      teste das regras de acesso
docs/
  LOGIN.md          esquema de login e passo a passo para colocar online
```

Os arquivos são scripts comuns carregados na ordem do `index.html` e compartilham o
objeto `window.Rancho`. Não há etapa de build.

## Rodar no computador

```
python3 -m http.server 8080
```

Abra http://localhost:8080. Para instalar como app e usar offline, publique em
hospedagem estática com HTTPS (Netlify, Cloudflare Pages, Vercel, GitHub Pages).

## Colocar online com login

Resumo: criar o projeto no Supabase, rodar `supabase/schema.sql`, ligar a
confirmação de e-mail, preencher `js/config.js` e publicar a pasta. O passo a
passo completo, com as configurações de e-mail e endereços, está em
[`docs/LOGIN.md`](docs/LOGIN.md).
