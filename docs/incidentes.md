# Registro de incidentes

Erros reais dos agentes usados neste trabalho (Claude Code), cada um com a mudança no harness que impede a
repetição e o commit dessa mudança. Para conferir: `git show --stat <hash>`.

Formato: o que aconteceu, por que o harness deixou acontecer, o que mudou e o commit.

---

## 1. O agente seguiu o README e a subida quebrou na porta 5432

**O que aconteceu.** Para sentir o problema antes de mudar qualquer coisa, o agente seguiu o passo 1 do
README antigo (`docker compose up -d`). Nesta máquina a 5432 já era de outro Postgres (`bs-postgres`) e o
compose falhou com `Bind for 0.0.0.0:5432 failed: port is already allocated`. A porta 4000 da API também
estava ocupada, pelo gateway de outro projeto. O `CLAUDE.md` antigo mandava resolver `EADDRINUSE` com
`kill -9` no processo da porta. Se o agente tivesse obedecido, teria derrubado um sistema que não era
dele.

**Por que o harness deixou.** O Balcão assumia ser a única cópia no mundo: Postgres, API e front em
portas fixas, e a documentação ensinava a matar quem estivesse no caminho.

**Mudança no harness.** `npm run up` dá a cada cópia o seu projeto do compose, com a porta do Postgres
escolhida pelo Docker. API e front usam portas livres, e os processos são encerrados pelo grupo que a
própria cópia iniciou, nunca pela porta. O `AGENTS.md` proíbe `kill -9` por porta.

**Commits:** `005d224` (Ambiente por cópia: npm run up/down/status) e `2d8f4dd` (AGENTS.md no lugar do
CLAUDE.md que mandava dar `kill -9`)

---

## 2. Uma opção na configuração desligou G6 e G7 sem nenhum aviso

**O que aconteceu.** Na primeira configuração do dependency-cruiser, o agente pôs `node_modules` em
`exclude`, junto com `doNotFollow`. O comando rodou normalmente e listou 17 violações. Faltavam três: o
`import type { Request } from 'express'` em `attachment-service.ts` (G6), o `import OpenAI from 'openai'`
na rota de chamados (G7) e o `PrismaClient` do worker (G12). Com `exclude`, os pacotes somem do grafo
também como destino, e as regras que olham express, openai e `@prisma/client` nunca casam. O erro só
apareceu porque o agente comparou a lista com as violações que sabia existir no código.

**Por que o harness deixou.** O kit original tem uma violação por forma de escrever cada regra, e o agente
ainda não tinha rodado o kit depois de mexer na configuração.

**Mudança no harness.** A opção foi corrigida, com um comentário explicando por que `node_modules` não
pode estar em `exclude`. O `kit-gates/violacoes/` ganhou variações que pegam esse tipo de regressão:
tipo inline do express, multer numa subpasta de serviços, tipo do openai num job, tipo do Prisma numa
rota, Prisma num job, ciclo só de tipo e outras. O `AGENTS.md` e o `docs/gates.md` mandam rodar o kit
sempre que a configuração de um gate mudar.

**Commit:** `b44fcbb` (Hook de pre-commit: tipo e lint sobre o que está no stage, com as variações do kit)

---

## 3. Um commit saiu com a mensagem de 41 arquivos e só 1 arquivo dentro

**O que aconteceu.** O agente encadeou `git add api/src/http/ ... api/src/utils/ ...` e `git commit` no
mesmo comando, sem parar em erro. O `git add` falhou porque `api/src/utils/` já tinha sido removido com
`git rm`, e nada foi adicionado. O `git commit` rodou mesmo assim e gravou um commit local com a mensagem
da refatoração inteira da API, mas só com a remoção de `legacy-sla.ts`. O commit seguinte, do front,
saiu correto, e a contradição passou despercebida até o agente ler o `git status`. Os dois commits foram
refeitos antes de qualquer push.

**Por que o harness deixou.** Não havia hook, e verificar a pasta de trabalho não teria ajudado: ela
estava certa. O errado era o stage.

**Mudança no harness.** O hook de pre-commit roda tipo e lint sobre o conteúdo do stage, exportado para
uma pasta temporária (`scripts/pre-commit.mjs`). Um commit que leva só parte de uma mudança, e por isso
quebra tipo ou lint, é bloqueado. O `AGENTS.md` pede `git add` e `git commit` em comandos separados e a
conferência de `git diff --cached --stat`.

**Commits:** `b44fcbb` (Hook de pre-commit: tipo e lint sobre o que está no stage) e `2d8f4dd` (regra de
commit no AGENTS.md)

---

## 4. `npm run status | head` terminava com um stack trace

**O que aconteceu.** Na validação final, seguindo o fluxo do avaliador, o agente cortou a saída do status
com `| head -2`, como agentes fazem o tempo todo. O `scripts/ambiente.mjs` morreu com
`Error: write EPIPE` e um stack trace de vinte linhas. Nada estava quebrado no ambiente. Mesmo assim, o
próximo agente que visse aquilo iria investigar o lugar errado. O mesmo valia para `npm run gates | head`.

**Por que o harness deixou.** Os scripts escreviam na saída padrão sem tratar o leitor que fecha o pipe
antes do fim, e nenhum teste cortava a saída.

**Mudança no harness.** `scripts/ambiente.mjs` e `scripts/gates.mjs` ignoram EPIPE: a subida continua até
o fim e o código de saída dos gates não muda.

**Commit:** `0d66284` (Scripts do harness não quebram com a saída cortada)
