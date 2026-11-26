# Gates

`npm run gates` roda `scripts/gates.mjs`: todas as verificações em paralelo, sem parar na primeira
falha. No fim vem a lista de violações, uma por linha, com o ID da regra e o arquivo (para dependência
sem uso, também o nome da dependência), e o comando sai com código 1 se houver qualquer violação:

```
G4 api/src/http/routes/stats.ts  (importa api/src/repositories/prisma.ts (G4-http-sem-repositorios))
G10 api/package.json left-pad  (dependência sem uso)
```

Nada é escrito dentro do repositório (o relatório do Vitest vai para uma pasta temporária), então os
gates rodam com o `git status` limpo, como o `kit-gates/` exige.

Antes de qualquer verificação, os gates (e o hook) conferem a versão do Node contra o `engines` do
`package.json`. Fora da faixa, param com código 1 e dizem o que instalar: com o Node errado, uma
ferramenta quebra sem dizer por quê (o knip, na 22.11) e a falha pareceria violação.

## Regras

| ID | Regra | Ferramenta | Onde está configurada |
|---|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` de cada pacote | `api/tsconfig.json`, `web/tsconfig.json` |
| G2 | Lint sem erro e sem warning em `api/` e `web/` (variável/import sem uso, `any` explícito, comentários `@ts-*`) | ESLint 10 + typescript-eslint | `eslint.config.mjs` |
| G3 | Testes unitários da API (`api/src/**/*.test.ts`) passam | Vitest (reporter JSON) | `api/vitest.config.mts` |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | ESLint, regra `balcao/env-so-em-config` | `scripts/eslint-balcao.mjs` |
| G6 | `api/src/services/` não importa express, multer nem `api/src/http/`, nem só o tipo | dependency-cruiser | `.dependency-cruiser.cjs` |
| G7 | O pacote openai só é importado em `api/src/integrations/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G8 | `web/` não importa nada de `api/`, nem só o tipo | dependency-cruiser | `.dependency-cruiser.cjs` |
| G9 | Nenhum import circular em `api/src/` e `web/src/` (inclusive só de tipo) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G10 | Nenhum arquivo, export (inclusive de tipo) ou dependência sem uso em `api/` e `web/` | knip | `knip.json` |
| G11 | Endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, `/tmp/`) só em `config/` | ESLint, regra `balcao/sem-endereco-fixo` | `scripts/eslint-balcao.mjs` |
| G12 | O Prisma Client só é usado em `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G13 | `AGENTS.md` com no máximo 60 linhas, `CLAUDE.md` apontando para ele, e todo caminho e comando citado no `AGENTS.md` existindo | `scripts/gates.mjs` | `scripts/gates.mjs` |

G11, G12 e G13 são as regras próprias deste repositório (motivação abaixo).

G5 e G11 olham todo arquivo de código em `api/src/` e `web/src/`: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`,
`.jsx`, `.mjs` e `.cjs`, testes inclusive. A G5 acusa o `process` do Node, não um parâmetro ou variável
local que por acaso se chame `process`.

### Imports só de tipo (G6, G8 e G9)

O dependency-cruiser roda com `tsPreCompilationDeps: true`: ele lê o TypeScript antes da compilação,
então `import type`, `import { type X }`, `export type { X } from`, `typeof import('x')`, `import x =
require('x')`, `require()` e `import()` contam como dependência. Sem essa opção, o TypeScript apaga os
imports só de tipo e a regra passaria em branco. Os destinos em `node_modules` não são varridos
(`doNotFollow`), mas continuam aparecendo como destino: é assim que as regras enxergam express,
multer, openai e `@prisma/client`. Não ponha `node_modules` em `exclude`: isso desliga G6, G7 e G12 sem
aviso (ver [incidentes](incidentes.md)).

### Sem supressão

`eslint.config.mjs` usa `noInlineConfig` (um `eslint-disable` não tem efeito e é acusado) e
`ban-ts-comment` proíbe `@ts-ignore`, `@ts-expect-error` e `@ts-nocheck`. As únicas exceções de
arquivo são as que a própria regra define: `api/src/config/` e `web/src/config/` na G5 e na G11.

## Hook de pre-commit

`.githooks/pre-commit` fica ativo depois de `npm run up` (`core.hooksPath`). Ele chama
`scripts/pre-commit.mjs`, que exporta o stage para uma pasta temporária e roda ali
`gates --commit`: G1 (tsc em `api/` e `web/`) e G2 (eslint, que inclui G5 e G11). Verificar o stage, e
não a pasta de trabalho, garante que o commit leva exatamente o que passou.

Num clone que ainda não rodou `npm run up`, o hook não está ativo. Nesse caso, `npm run gates` avisa no
fim da saída, sem mudar o código de saída.

## Regras próprias

### G11: sem endereço fixo fora de `config/`

**Motivação.** O Balcão achava que era a única cópia no mundo: CORS preso em `http://localhost:5173`,
front caindo em `http://localhost:4000` em três lugares, anexos em `/tmp/balcao/uploads`. Com duas
worktrees, a segunda cópia falava com a API da primeira e misturava os anexos. Endereço e pasta são
configuração: só podem aparecer em `api/src/config/` ou `web/src/config/`, que leem o valor de cada cópia.

Teste também é acusado, de propósito: as duas cópias rodam os testes ao mesmo tempo, e um teste que
escreve em `/tmp/balcao-x` ou chama `http://localhost:4000` colide com o da outra cópia (ou com outro
sistema da máquina). Num teste, a mensagem da regra já diz o que fazer: pasta com
`mkdtemp(join(tmpdir(), 'balcao-'))` e URL lida de `config/`.

**Exemplos de violação** (formato do `kit-gates/`): `kit-gates/violacoes/G11-a-url-fixa-no-front`
(URL fixa no front), `kit-gates/violacoes/G11-b-pasta-tmp-na-api` (pasta em `/tmp` num serviço),
`kit-gates/violacoes/G11-c-url-fixa-em-jsx` e `kit-gates/violacoes/G11-d-pasta-tmp-num-teste`.

```bash
bash kit-gates/verificar.sh . "npm run gates" G11
```

### G12: Prisma Client só em `api/src/repositories/`

**Motivação.** O worker de triagem criava o próprio `PrismaClient`, lia `DATABASE_URL` direto e
atualizava chamados sem passar pela camada de repositórios. Toda regra de acesso a dados ficava
duplicada e invisível para quem mexe em `api/src/repositories/`. A G4 só protege `api/src/http/`; a G12
estende a proteção a serviços, jobs, integrações e ao resto de `api/src/` (em `api/src/http/`, quem acusa é
a G4, para não repetir a linha).

**Exemplos de violação**: `kit-gates/violacoes/G12-a-servico-com-prisma` e
`kit-gates/violacoes/G12-b-job-com-tipo-do-prisma` (até um `import type` acusa).

```bash
bash kit-gates/verificar.sh . "npm run gates" G12
```

### G13: a documentação para agentes não mente

**Motivação.** O `CLAUDE.md` antigo mandava rodar `npm run migrate` (não existia), citava
`api/src/controllers/`, `api/tests/` e `web/src/store/` (não existiam) e pedia axios (o front usa
`fetch`). Cada agente que lia aquilo errava de primeira. A G13 confere, a cada execução dos gates, que o
`AGENTS.md` tem no máximo 60 linhas, que o `CLAUDE.md` aponta para ele e que todo caminho e todo
script npm citado (`npm run x`, `npm --prefix api run x`, `npm test`, `npm start`) existem. Comandos com placeholder (`<api>`) ficam de fora, e por isso o `AGENTS.md`
explica como preencher cada um.

**Exemplo de violação** (patch, porque a regra olha um arquivo que já existe):

```bash
git apply docs/exemplos/G13-agents-cita-caminho-inexistente.patch
npm run gates          # falha com: G13 AGENTS.md  (caminho inexistente: ...)
git checkout -- AGENTS.md
```

## Testando os gates

O `kit-gates/` planta violações, uma por vez, e confere a linha com o ID e o arquivo. Além das 19
violações originais, `kit-gates/violacoes/` tem variações das mesmas regras (import type inline,
re-export de tipo, import dinâmico, env desestruturado ou por colchetes, env e URL fixa em `.mts`,
`.js`, `.mjs` e `.jsx`, pasta em `/tmp` num teste, ciclo só de tipo, tipo exportado sem uso,
dependência sem uso no front) e os exemplos das regras próprias:

```bash
bash kit-gates/verificar.sh . "npm run gates"        # todas
bash kit-gates/verificar.sh . "npm run gates" G6     # só uma regra
```

Rode o kit sempre que mexer na configuração de uma ferramenta: uma opção errada pode desligar uma regra
sem nenhum aviso, e os gates continuam passando.

## Como acrescentar uma regra

- Regra de dependência: um item em `forbidden` de `.dependency-cruiser.cjs` com nome começando pelo ID
  (`G14-...`). O runner usa esse prefixo.
- Regra de código: uma regra no plugin `scripts/eslint-balcao.mjs` e o ID dela em `REGRAS_ESLINT`
  (`scripts/gates.mjs`).
- Em qualquer caso: um exemplo de violação em `kit-gates/violacoes/` e uma linha neste arquivo.
