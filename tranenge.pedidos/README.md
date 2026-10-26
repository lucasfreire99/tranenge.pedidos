# Rancho Pedidos

Monta o pedido de marmitas (café, almoço e jantar) por alojamento e frente de obra
e gera o texto pronto para colar no WhatsApp. Tem cadastros, histórico, relatório
mensal, backup, tema claro/escuro e pode ser instalado como app.

## Estrutura

```
index.html        página principal
sw.js             service worker (uso offline; só fora do Claude)
css/
  tokens.css      cores e fontes, tema claro e escuro
  styles.css      layout e componentes
js/
  logic.js        regras puras: ler mensagem, totais, texto do WhatsApp, relatório, backup
  util.js         aviso rápido, copiar, confirmação em dois cliques, localStorage
  store.js        estado, pedidos do dia e gravação dos dados
  theme.js        botão de tema
  pwa.js          instalar como app (manifest e ícones gerados no navegador)
  backup.js       exportar e restaurar backup (.json)
  views.js        telas
  actions.js      cliques e digitação
  main.js         ponto de entrada
```

Os arquivos são scripts comuns carregados nessa ordem e compartilham o objeto
`window.Rancho`. Não há etapa de build nem dependências.

## Rodar no computador

```
cd rancho-pedidos
python3 -m http.server 8080
```

Abra http://localhost:8080. Para instalar como app e usar offline, publique em
qualquer hospedagem com HTTPS (Netlify, Vercel, GitHub Pages, servidor próprio).

## Onde ficam os dados

Fora do Claude, tudo é salvo no `localStorage` do navegador, neste aparelho.
Use **Cadastros > Backup > Exportar backup** para guardar uma cópia e
**Restaurar de arquivo** para trazer os dados para outro aparelho.

Dentro do Claude, os dados ficam no banco da página e uma cópia vai para o
`localStorage`. Para virar um SaaS com várias empresas, troque a camada de
gravação em `js/store.js` (`persist` e `init`) por uma API com login.
