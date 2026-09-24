# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Código, comentários e mensagens de commit deste repositório são em português. Siga o mesmo idioma.

## Comandos

```bash
node server.js          # sobe o servidor em http://localhost:3000
npm start               # idem
./iniciar-servidor.ps1  # mata processo preso na porta 3000, sobe via pm2 e abre o navegador
```

`iniciar-servidor.ps1` (e o `.bat` equivalente) define `BANCO_LOCAL=1` e reinicia o processo do zero em vez de usar `pm2 restart` — variável de ambiente nova não chega a um processo que já existe.

**Não há build, lint nem suíte de testes.** O `package.json` tem só o script `start`, e o `server.js` não usa nenhuma dependência externa: apenas módulos nativos do Node (>= 18). Verificação de mudança é feita rodando o servidor e abrindo a página.

## Arquitetura

### O site vive em dois lugares ao mesmo tempo

Este é o fato central do projeto, e quase todo problema estranho vem de esquecê-lo:

| Host | O que é | O que serve |
|---|---|---|
| `www.agentej.us` | GitHub Pages | só arquivos estáticos |
| `advogacert.onrender.com` | Node (`server.js`) | todas as rotas de API, login, pagamento, painel |

O Pages responde 404/405 a qualquer rota do servidor. Por isso **nenhum `fetch` do front pode usar caminho relativo**: todos passam por `window.apiUrl(...)`, definido em `assets/js/api.js`, que resolve o host conforme onde a página está aberta (relativo em localhost e no Render, absoluto para o Render quando aberta no Pages). Carregue `api.js` **antes** de `script.js`.

`_config.yml` lista os arquivos que o Pages **não** publica (`server.js`, `admin.html`, os `.php`, `lib/`, etc.). Os arquivos PHP são legado da hospedagem anterior; o `server.js` responde nos mesmos caminhos (`/gpt.php`, `/login.php`) para o front não precisar mudar.

### server.js

Arquivo único de ~4.500 linhas, sem framework: um `http.createServer` com uma cadeia de `if (method === ... && url === ...)`. Não há roteador — rotas novas entram como mais um `if` na cadeia, e a ordem importa. Grupos principais: `/otp/*`, `/auth/:provider` e `/auth/:provider/callback`, `/chamado/*`, `/agenda/*`, `/pagamento/*`, `/webhook/mercadopago`, `/telemetria/*` e `/admin/*`.

### Banco: Supabase ou arquivo, com espelho em memória

O servidor mantém `memDb`, um objeto em memória com as sete coleções (`usuarios`, `assinaturas`, `chamados`, `logins`, `agendamentos`, `verificacoes_oab`, `auditoria`). Ele é carregado uma vez no boot e é a fonte de leitura de todas as rotas.

- Com `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, carrega do Supabase via PostgREST e grava lá.
- Sem elas, usa `usuarios.json` no disco.
- `BANCO_LOCAL=1` força o arquivo **mesmo com a chave do Supabase presente**, para a máquina local nunca tocar o banco de produção.

**Nunca defina `BANCO_LOCAL` no Render** — o painel de produção passaria a ler um arquivo que o deploy apaga a cada publicação.

Alterar `memDb` não persiste nada sozinho: é preciso chamar a função de gravação (`saveJsonDb`). Toda linha enviada ao Supabase passa por `db_colunas.js`, que devolve sempre as mesmas colunas na mesma ordem — o PostgREST recusa um lote inteiro com `PGRST102` se os objetos tiverem chaves diferentes entre si. Ao acrescentar coluna em `supabase_schema.sql`, acrescente também em `db_colunas.js`.

### Configuração e segredos

Ordem de leitura, sempre a mesma: **variável de ambiente > arquivo `*_config.json` na raiz**. Os arquivos ficam no `.gitignore` e têm um `*_config.example.json` ao lado documentando o formato — `secrets_config` (Brevo, Supabase, DeepSeek), `oauth_config` (Google/Microsoft), `otp_config`, `pagamento_config` (Mercado Pago, senha e TOTP do painel).

Tudo é lido **uma vez, no boot**. Depois de editar qualquer `*_config.json`, reinicie o servidor ou a mudança não vale.

`OAUTH_BASE_URL` precisa ser o domínio do **Render**, não o do site: é com ele que se monta o `redirect_uri` mandado ao Google, e o mesmo valor tem de estar no Google Cloud Console. O cliente volta para `www.agentej.us` pelo parâmetro `?retorno=`, no fim do fluxo.

### Front-end

Sem framework e sem build. `assets/js/script.js` é compartilhado por todas as páginas públicas; `assets/js/admin/` é o painel, dividido em módulos que se comunicam por globais (`AdminDom`, `AdminApi`, `AdminIndicadores`, …) carregados na ordem em `admin.html`.

Os arquivos são referenciados com cache-busting manual: `script.js?v=20`, `admin.css?v=90`. **O número é por página e não está sincronizado entre elas** — ao editar um arquivo compartilhado, incremente o `?v=` em todas as páginas que precisam da versão nova, ou o navegador serve a antiga. Foi assim que mudanças "não apareceram" mais de uma vez.

Boa parte das ilustrações (janela da IDE, tela do PJe, folha timbrada, mini-dashboard) é feita só com HTML e CSS animado, sem imagem externa. Duas armadilhas recorrentes nesse tipo de bloco:

- Datilografia animando `width` exige `white-space: nowrap`, o que impede a quebra de linha e **corta o texto na margem**. Para texto que precisa quebrar, revele blocos por `opacity`.
- `1fr` em grid equivale a `minmax(auto, 1fr)` e não encolhe abaixo do conteúdo. Com filhos em `nowrap`, a grade estoura a largura da tela e a página inteira ganha arrasto lateral. Use `minmax(0, 1fr)` e `min-width: 0` em filhos flex.

## Deploy

Dois destinos, a partir do mesmo push na branch `main`:

- **Site** → GitHub Pages republica `www.agentej.us` em cerca de um minuto.
- **Servidor** → Render redeploya `advogacert.onrender.com` a partir do `render.yaml`.

As chaves não estão no `render.yaml` (`sync: false`): são cadastradas como variáveis secretas no painel do Render. Uma variável nova precisa ser adicionada lá **e** no `render.yaml`, senão o próximo serviço criado pelo blueprint não a pede.
