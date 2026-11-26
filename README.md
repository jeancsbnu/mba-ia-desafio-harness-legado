# Balcão

Central de chamados. Clientes abrem chamados, uma IA faz a triagem (categoria e prioridade) em segundo
plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma (Postgres) e o worker de triagem, que é um processo separado.
- `web/`: front em React + Vite.
- `blackbox/`: suíte caixa-preta da API, que é o contrato HTTP.
- `kit-gates/`: kit que testa os gates plantando violações.

Este repositório tem um harness para que qualquer pessoa ou agente suba o ambiente, mexa no código e prove
que não quebrou nada: um comando de subida por cópia, gates mecânicos, um hook de pre-commit e
documentação para agentes ([AGENTS.md](AGENTS.md)).

## Como rodar

**Pré-requisitos:** Linux ou macOS (no Windows, WSL), Node.js 22 ou mais novo (LTS), Docker com
`docker compose` e Git. Nenhuma porta precisa estar livre de antemão.

```bash
npm run up       # sobe tudo desta cópia; pode rodar de novo sem derrubar
npm run status   # mostra de novo os endereços e se os processos estão de pé
npm run down     # derruba só o que a subida desta cópia iniciou (dados ficam no volume)
npm run gates    # roda todas as regras (G1 a G13) e lista as violações
```

Num clone limpo, `npm run up` instala as dependências (`npm ci`, respeitando os lockfiles), sobe o
Postgres da cópia, aplica as migrations, roda a seed (idempotente), ativa o hook de pre-commit e sobe
API, worker e front. No fim, ele informa:

```
Balcão no ar (cópia copia-a-1a2b3c)
  API:      http://localhost:4556   (saúde: http://localhost:4556/api/health)
  Front:    http://localhost:5756
  Banco:    postgresql://balcao:balcao@localhost:59759/balcao   (Postgres do projeto compose balcao-copia-a-1a2b3c)
  Anexos:   /caminho/da/copia-a/.balcao/anexos
  Logs:     /caminho/da/copia-a/.balcao/logs
  Derrubar: npm run down
```

Para uma segunda cópia ao mesmo tempo, por exemplo uma worktree:

```bash
git worktree add ../copia-b && cd ../copia-b && npm run up
```

Ela recebe outras portas, outro banco, outra pasta de anexos e o seu próprio worker. Detalhes e problemas
comuns: [docs/ambiente.md](docs/ambiente.md).

A IA roda em modo fake por padrão (palavras-chave, sem chave nenhuma). Para usar a OpenAI, coloque
`AI_MODE=openai` e `OPENAI_API_KEY` no `api/.env` da cópia: a subida preserva esses valores.

**Testes:**

```bash
npm --prefix api run test               # unitários da API (sem banco)
npm --prefix api run test:integration   # integração, no banco balcao_test da cópia
cd blackbox && npm ci && API_URL=<API informada pelo npm run up> npm test   # caixa-preta
```

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Gates

`npm run gates` roda tudo, sem parar na primeira falha, e termina com uma linha por violação: o ID da
regra e o arquivo (`G4 api/src/http/routes/stats.ts`). Para dependência sem uso, a linha traz também o
nome da dependência. Sai com código diferente de zero se qualquer regra falhar.

| ID | Regra | Ferramenta |
|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` |
| G2 | Lint sem erro e sem warning em `api/` e `web/` (sem uso, `any` explícito, `@ts-*`) | ESLint + typescript-eslint |
| G3 | Testes unitários da API passam | Vitest |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | ESLint (plugin local) |
| G6 | `api/src/services/` não importa express, multer nem `api/src/http/` (nem só tipo) | dependency-cruiser |
| G7 | O pacote openai só em `api/src/integrations/` | dependency-cruiser |
| G8 | `web/` não importa nada de `api/` (nem só tipo) | dependency-cruiser |
| G9 | Nenhum import circular em `api/src/` e `web/src/` | dependency-cruiser |
| G10 | Nenhum arquivo, export (inclusive de tipo) ou dependência sem uso | knip |
| **G11** | Endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, `/tmp/`) só em `config/` | ESLint (plugin local) |
| **G12** | Prisma Client só em `api/src/repositories/` | dependency-cruiser |
| **G13** | `AGENTS.md` com até 60 linhas, `CLAUDE.md` apontando para ele, e todo caminho e comando citado nele existindo | `scripts/gates.mjs` |

O dependency-cruiser roda com `tsPreCompilationDeps`, então imports só de tipo contam em G6, G8 e G9.
Comentário de supressão não funciona: `noInlineConfig` no ESLint e `ban-ts-comment` para `@ts-*`.

**Hook:** `.githooks/pre-commit` fica ativo depois do `npm run up` e roda tipo (tsc) e lint (eslint)
sobre o conteúdo do stage. Se falhar, o commit é bloqueado.

### Regras próprias: motivação e como aplicar o exemplo de violação

- **G11, sem endereço fixo fora de config.** O Balcão tinha CORS, URL da API e pasta de anexos fixos no
  código, e a segunda cópia falava com a primeira. Exemplos: `kit-gates/violacoes/G11-a-url-fixa-no-front`
  e `G11-b-pasta-tmp-na-api`.
  ```bash
  bash kit-gates/verificar.sh . "npm run gates" G11
  ```
- **G12, Prisma só em repositórios.** O worker tinha um `PrismaClient` próprio e atualizava chamados por
  fora da camada de dados. Exemplos: `kit-gates/violacoes/G12-a-servico-com-prisma` e
  `G12-b-job-com-tipo-do-prisma`.
  ```bash
  bash kit-gates/verificar.sh . "npm run gates" G12
  ```
- **G13, a documentação para agentes não mente.** O `CLAUDE.md` antigo citava comando e pastas que não
  existiam. Exemplo (patch):
  ```bash
  git apply docs/exemplos/G13-agents-cita-caminho-inexistente.patch
  npm run gates            # falha: G13 AGENTS.md (caminho inexistente)
  git checkout -- AGENTS.md
  ```

Para testar todas as regras: `bash kit-gates/verificar.sh . "npm run gates"`. Além das 19 violações
originais, o kit tem variações das mesmas regras e os exemplos acima. Mais em [docs/gates.md](docs/gates.md).

## Decisões

**Como as cópias foram isoladas.** Cada clone ou worktree é uma cópia, identificada pelo nome da pasta
mais um hash do caminho. A cópia tem:

- o seu projeto do docker compose (`balcao-<cópia>`), com Postgres e volume próprios e a porta do host
  escolhida pelo Docker;
- portas livres para API e front, estáveis entre subidas;
- a sua pasta de anexos e os seus processos, cada um no seu grupo;
- tudo isso registrado em `.balcao/` (fora do Git).

`npm run up` gera o `api/.env` e o `web/.env.local` da cópia: o front aponta para a API da própria cópia e
o CORS aceita o front da própria cópia. As variáveis também vão explícitas para os processos, para que um
`PORT` exportado no shell não aponte a cópia para outro lugar. A seed passou a ser idempotente. `npm run
down` encerra só os grupos de processos e o projeto compose da cópia: nada é procurado por porta.

**Como as violações que já existiam foram corrigidas.** Os gates entraram primeiro, acendendo 88
violações, e o código foi corrigido guiado pela lista, sem nenhuma supressão:

- **G4:** as rotas viraram fábricas que recebem serviços prontos, e o `main.ts` monta repositórios ->
  serviços -> app. Estatísticas, health e sugestão ganharam serviço ou função injetada.
- **G6:** os serviços lançam `DomainError`, e só `http/errors.ts` traduz o código para status. O upload
  recebe o arquivo como `UploadedFile`, não um `Request`.
- **G5 e G11:** cada variável de ambiente e cada padrão de endereço foram para `api/src/config/` ou
  `web/src/config/`.
- **G7:** a sugestão de resposta usa o cliente de IA de `integrations/`.
- **G8:** o front declara os próprios tipos.
- **G9:** `formatTicketRef` foi para o domínio, o que quebrou o ciclo entre serviços.
- **G10:** saíram código e exports mortos (`legacy-sla.ts`, `calculateSlaDeadline`, `formatCurrency`)
  e as dependências `lodash` e `axios`.
- **G12:** o worker passou a usar `TriageService` e o repositório.
- **G2:** os `any` deram lugar a tipos de domínio.

A caixa-preta passou com 51 de 51 antes e depois. Os testes unitários dos serviços novos e da tradução de
erros ficam ao lado do código.

**O que mudou na documentação para agentes.** O `CLAUDE.md` antigo mandava rodar comando inexistente,
citava pastas que não existem, pedia `any` e `kill -9` por porta. Ele agora só aponta para o
[AGENTS.md](AGENTS.md), que é um índice de até 60 linhas: como subir, derrubar e rodar os gates, as
contas da seed, as regras de camada e onde está o detalhe ([docs/ambiente.md](docs/ambiente.md),
[docs/gates.md](docs/gates.md) e [docs/arquitetura.md](docs/arquitetura.md)). A regra G13 confere a cada
execução dos gates que o `AGENTS.md` não cita caminho nem comando que não existe.

## Registro de incidentes

Erros reais dos agentes durante este trabalho e a mudança no harness que impede cada um de se repetir:
[docs/incidentes.md](docs/incidentes.md).
