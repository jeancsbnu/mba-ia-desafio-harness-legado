# AGENTS.md: Balcão

Central de chamados: API (Express + Prisma + Postgres), worker de triagem (processo separado) e front
(React + Vite). Este arquivo é o índice; o detalhe está em `docs/`. Cada comando aqui roda da raiz.

## Ambiente (cada clone ou worktree é uma cópia isolada)
- Subir tudo: `npm run up`. Instala, sobe o Postgres da cópia, migra, roda a seed e sobe API, worker e
  front. Pode rodar de novo sem derrubar. A saída mostra API, front, banco e pasta de anexos.
- Rever endereços e processos: `npm run status`. Logs em `.balcao/logs/`.
- Derrubar só esta cópia: `npm run down` (`npm run down -- --apagar-dados` apaga também o banco).
- Portas nunca são fixas: não suba nada na mão em 3000/4000/5173/5432 e nunca use `kill -9` por porta
  (o processo pode ser de outra cópia ou de outro sistema). Detalhe: [docs/ambiente.md](docs/ambiente.md).

## Gates (rode antes de dizer que terminou)
- Tudo: `npm run gates`. Termina com uma linha por violação: `<regra> <arquivo>  (detalhe)`.
- O hook de pre-commit roda `npm run gates:commit` (tipo e lint) sobre o que está no stage.
- Corrija a causa. Não vale `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `any`
  explícito nem tirar arquivo das ferramentas.
- Mexeu em configuração de gate? Rode `bash kit-gates/verificar.sh . "npm run gates"` (todas barradas).
  Achou um furo num gate? Procure o mesmo furo nos outros (extensão, glob, alias) antes de fechar.
- Regras G1 a G13, ferramentas e exemplos de violação: [docs/gates.md](docs/gates.md).

## Camadas
- `api/src/http/`: rotas e middlewares; só chamam serviços. Nada de `api/src/repositories/` nem
  `@prisma/client` (G4).
- `api/src/services/`: regras de negócio; nada de express, multer ou `api/src/http/`, nem import só de tipo
  (G6). Erro de negócio é `DomainError` (`api/src/domain/errors.ts`); o status HTTP sai em `api/src/http/errors.ts`.
- `api/src/repositories/`: único lugar do Prisma Client (G12). `api/src/integrations/`: único lugar do
  pacote openai (G7).
- `api/src/config/`: único lugar que lê `process.env` (G5) e que pode ter endereço fixo (G11).
- `api/src/main.ts` e `api/src/jobs/triage-worker.ts` montam repositórios -> serviços.
- `web/src/` não importa nada de `api/` (G8); `import.meta.env` só em `web/src/config/`.
- Sem import circular (G9) e sem arquivo, export ou dependência sem uso (G10).
  Detalhe: [docs/arquitetura.md](docs/arquitetura.md).

## Testes
- Unitários da API, ao lado do código (`api/src/**/*.test.ts`, sem banco): `npm --prefix api run test`.
- Integração (banco `balcao_test`, criado pelo `npm run up`): `npm --prefix api run test:integration`.
- Caixa-preta (o contrato HTTP; não pode mudar): `cd blackbox && npm ci && API_URL=<api> npm test`,
  trocando `<api>` pelo endereço da API que o `npm run up` mostrou.

## Contas da seed
| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Regras de trabalho
- Não mude rotas, corpos, status nem códigos de erro; não renomeie nem mova as pastas fixas de `api/src/`.
- IA em modo fake por padrão (`AI_MODE=fake`). `[falha-ia]` no título força a falha da triagem.
- Commit: `git add` e `git commit` em comandos separados; confira `git diff --cached --stat` antes.
- O agente errou e o harness deixou? Registre em [docs/incidentes.md](docs/incidentes.md) com a mudança
  no harness que impede a repetição.
