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

**Mudança no harness.** O erro foi pego antes do primeiro commit dos gates. Por isso o
`.dependency-cruiser.cjs` já entrou certo em `cba848b`: só `doNotFollow` para `node_modules`, com um
comentário explicando por que ele não pode estar em `exclude`. O que impede a repetição veio depois. O
`kit-gates/violacoes/` ganhou variações que pegam esse tipo de regressão: tipo inline do express, multer
numa subpasta de serviços, tipo do openai num job, tipo do Prisma numa rota, Prisma num job, ciclo só de
tipo e outras. O `AGENTS.md` e o `docs/gates.md` mandam rodar o kit sempre que a configuração de um gate
mudar.

**Commits:** `cba848b` (Gates, com a configuração do dependency-cruiser já corrigida e comentada) e
`b44fcbb` (variações do kit que barram a regressão)

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

---

## 5. Uma revisão independente achou formas de violação que passavam pelos gates

**O que aconteceu.** Depois do merge, outro agente (Sonnet) revisou a entrega sem ver o raciocínio de
quem a fez e plantou umas 120 variações de violação. Três passavam em branco, e todas eram erro do agente
que configurou os gates. Na G6, um `import type { Request } from 'express-serve-static-core'` num
serviço não era acusado: o pacote resolve para `@types/express-serve-static-core`, e a regra só conhecia
`@types/express`. Na G10, um arquivo sem uso com extensão `.mts` ou `.js` não era acusado, porque o
`knip.json` só olhava `.ts` e `.tsx`. A revisão também apontou que `web/vite.config.ts` ainda fixava a
porta 5173, e que o incidente 2 citava um commit que não continha a correção descrita.

**Por que o harness deixou.** As variações do kit cobriam as formas que o próprio agente imaginou. Quem
escreve a regra tende a testar só o que já pensou.

**Mudança no harness.** A regra G6 passou a incluir os pacotes de tipos do Express e do multer. O knip
agora olha ts, tsx, mts, cts, js, jsx, mjs e cjs em `api/` e `web/`. O kit ganhou as variações G06-f,
G10-f e G10-g. O Vite lê a porta de `WEB_PORT`, que o `npm run up` grava no `web/.env.local`.

**Commit:** `db2857d` (Revisão: G6 pega os tipos do Express, G10 olha todas as extensões)

---

## 6. A primeira subida num clone limpo falhava nas migrations

**O que aconteceu.** Uma segunda revisão independente (Sonnet) seguiu o fluxo do avaliador. A primeira
`npm run up` de um clone limpo parou com `P1001: Can't reach database server`, e a da worktree nova
também. Rodar `npm run up` de novo resolvia. O agente que fez o harness tinha validado esse mesmo fluxo
e visto a subida passar: a falha dependia de tempo e não apareceu naquela rodada.

**Por que o harness deixou.** O healthcheck do Postgres (`pg_isready` sem `-h`) testava o socket Unix.
Num volume novo, a imagem do Postgres cria o banco num servidor temporário que só escuta no socket,
desliga e só então sobe o servidor definitivo na porta TCP. O healthcheck dava "saudável" no servidor
temporário, o `docker compose up --wait` liberava a subida e o `prisma migrate deploy` batia numa porta
que ainda não respondia. Em três subidas com volume novo, nenhuma aceitava conexão TCP logo depois do
`--wait`.

**Mudança no harness.** O healthcheck testa por TCP (`pg_isready -h 127.0.0.1`), que só responde no
servidor definitivo. Depois da mudança, as mesmas três subidas aceitaram conexão logo depois do `--wait`.
Um clone limpo e uma worktree nova também subiram de primeira, e a caixa-preta deu 51 de 51 nas duas. O
`docs/ambiente.md` explica por que o socket não serve.

**Commit:** `98801d9` (Banco: healthcheck por TCP, a primeira subida não falha nas migrations)

---

## 7. O furo de extensão da G10 se repetia na G5 e na G11

**O que aconteceu.** O incidente 5 corrigiu a G10, que só olhava `.ts` e `.tsx`. A segunda revisão achou
o mesmo furo na G5 e na G11. O plugin do ESLint só valia para `api/src/**/*.ts` e
`web/src/**/*.{ts,tsx}`, e um `process.env` num `.mts`, ou um `import.meta.env` num `.js` do front,
passava em branco. A revisão também achou erros na direção contrária. A G5 acusava um parâmetro que só
se chamava `process`, e a G13 aceitava `` `npm test` `` no `AGENTS.md`, embora a raiz não tenha esse
script.

**Por que o harness deixou.** Ao corrigir a G10, o agente olhou só o gate que a revisão apontou e não
procurou o mesmo padrão de glob nos outros. A G5 olhava o nome `process`, não a variável. A G13 só
reconhecia a forma `npm run x`.

**Mudança no harness.** G5 e G11 olham todas as extensões de código em `api/src/` e `web/src/`. A G5
resolve o escopo antes de acusar. A G13 confere também `npm test`, `npm start` e `npm run-script`. O kit
ganhou as variações G05-f, G05-g, G05-h, G11-c e G11-d. A G11 continua valendo em teste, de propósito:
as cópias rodam os testes ao mesmo tempo, e a mensagem diz como criar a pasta temporária (ver
`docs/gates.md`). O `AGENTS.md` pede que, achado um furo num gate, o mesmo furo seja procurado nos outros.

**Commits:** `7e16d83` (Gates: G5 e G11 em todas as extensões, G5 sem falso positivo, G13 confere npm
test) e `ea9fbd9` (AGENTS.md: furo achado num gate se procura também nos outros)

---

## 8. O harness prometia Node 22, e na 22.11 o knip quebrava

**O que aconteceu.** O README dizia "Node.js 22 ou mais novo", os quatro `package.json` declaravam
`>=22` e o `npm run up` só recusava versões abaixo da 22. O agente que escreveu isso tinha rodado tudo só
no Node 26. Quando o usuário pediu um teste com o Node 22, a versão mais nova da linha (22.23.5) passou
em tudo, mas a 22.11 não: o `npm run up` aceitou, e o G10 falhou com `ERR_REQUIRE_ESM` dentro do knip,
sem dizer que o motivo era a versão do Node. Na 22.12, os gates passavam, mas o `npm ci` emitia 11 avisos
EBADENGINE, porque o ESLint 10 só declara suporte a partir da 22.13.

**Por que o harness deixou.** A versão mínima foi escrita de memória, sem olhar o `engines` das
dependências e sem testar a versão mais baixa prometida. O `npm ci` só avisa quando o `engines` não bate,
e a subida esconde a saída dele quando a instalação dá certo.

**Mudança no harness.** O `engines` dos quatro `package.json` (e dos lockfiles) virou
`^22.13.0 || ^24.0.0 || >=26.0.0`, a interseção do que as 252 dependências com `engines` declaram.
`scripts/node-suportado.mjs` lê essa faixa, e a subida, os gates e o hook param antes de qualquer outra
coisa quando o Node está fora, dizendo o que instalar. A faixa só fica escrita no `package.json`. Num
clone limpo, a 22.13.0 passou em tudo sem nenhum aviso EBADENGINE, e a 22.11 e a 22.12 foram recusadas
antes de instalar qualquer coisa. O que ainda escapa: uma atualização de dependência que suba o piso. O
npm só avisa quem roda a versão afetada.

**Commits:** `d6737d5` (Node: versão mínima 22.13, conferida na subida e nos gates) e `94d865d` (Hook:
Node fora da faixa bloqueia o commit com mensagem própria)
