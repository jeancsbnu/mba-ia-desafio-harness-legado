# Ambiente: uma cópia isolada por clone ou worktree

`npm run up`, `npm run down` e `npm run status` chamam `scripts/ambiente.mjs`, que só usa módulos do
Node e roda em Linux e macOS com Node 22+, Docker (com `docker compose`) e Git. No Windows, use o WSL.

## O que identifica uma cópia

A cópia é a pasta do clone ou da worktree. O nome dela é `<pasta>-<6 primeiros caracteres do sha1 do
caminho>`, por exemplo `copia-b-3a6ff3`. Duas worktrees, ou dois clones com o mesmo nome em pastas
diferentes, têm nomes diferentes. Tudo o que a cópia cria leva esse nome ou fica dentro dela:

| Recurso | Como é isolado |
|---|---|
| Postgres | Projeto do compose `balcao-<cópia>` (`docker compose -p`): container e volume próprios |
| Porta do banco | Escolhida pelo Docker (`127.0.0.1::5432` no `docker-compose.yml`) e lida com `docker compose port` |
| Porta da API e do front | Sugestão estável derivada do caminho (4100-4899 e 5200-5899); se estiver ocupada, a próxima livre |
| Anexos | `.balcao/anexos/` da cópia (`UPLOAD_DIR`) |
| Processos | API, worker e front sobem cada um no seu grupo de processos; os PIDs ficam em `.balcao/estado.json` |
| Configuração | `api/.env` e `web/.env.local` gerados pela subida; as mesmas variáveis vão explícitas para os processos |
| Front -> API | `VITE_API_URL` aponta para a API da cópia; o CORS da API aceita o front da cópia (`CORS_ORIGIN`) |

## O que a subida faz, em ordem

1. Confere Node, Docker e Git.
2. Encerra os processos que ESTA cópia tinha deixado de pé (confere PID e horário de início, para não
   matar um processo que reaproveitou o PID).
3. Roda `npm ci` na raiz, em `api/` e em `web/`, só quando o `package-lock.json` mudou desde a última
   instalação. `npm ci` respeita o lockfile como ele está.
4. Ativa o hook de pre-commit (`git config core.hooksPath .githooks`).
5. Sobe o Postgres da cópia e espera ele ficar saudável.
6. Escolhe as portas, grava `api/.env` e `web/.env.local`. As chaves de endereço (`DATABASE_URL`, `PORT`,
   `UPLOAD_DIR`, `CORS_ORIGIN`) são sempre regravadas; as outras (`AI_MODE`, `OPENAI_API_KEY`,
   `JWT_SECRET`) mantêm o que já estava no `.env`.
7. `prisma generate`, `prisma migrate deploy`, cria e migra o banco `balcao_test` e roda a seed.
   A seed é idempotente: as contas são garantidas por e-mail e os chamados de exemplo só são criados uma vez.
8. Sobe API (`tsx watch`), worker e front (Vite) e espera: `GET /api/health` responder, o worker
   anunciar que está rodando e o front responder. Se algum não subir, mostra o fim do log e para.
9. Mostra API, front, banco, pasta de anexos e logs.

Rodar `npm run up` de novo, sem derrubar, reinicia os processos da cópia com as mesmas portas e não
duplica nada.

## Derrubar

`npm run down` encerra os grupos de processos da cópia (SIGTERM e, se preciso, SIGKILL) e faz
`docker compose -p balcao-<cópia> down`. Os dados ficam no volume; `npm run down -- --apagar-dados`
apaga também o volume. Nenhum processo é procurado por porta: outras cópias nunca são afetadas.

## Duas cópias ao mesmo tempo

```bash
git worktree add ../copia-b
cd ../copia-b
npm run up
```

Cada cópia tem o seu banco, as suas portas, a sua pasta de anexos e o seu worker. Um chamado criado numa
não aparece na outra, e cada worker só tria os chamados do próprio banco.

## Problemas comuns

- **"o Docker não está respondendo"**: abra o Docker (no WSL, ligue a integração da distro no Docker
  Desktop) e rode `npm run up` de novo.
- **Algo não ficou de pé**: a subida mostra o fim do log; o log completo está em `.balcao/logs/`.
- **Quero começar do zero**: `npm run down -- --apagar-dados` e `npm run up`.
- **401 no front logo depois de subir**: o token guardado no navegador é de um banco que já foi apagado
  (`--apagar-dados`). Faça login de novo. Cada cópia tem a sua porta e, portanto, o seu `localStorage`:
  o login de uma cópia não vaza para a outra.
- **Rodar os testes de integração**: `npm --prefix api run test:integration` usa o `DATABASE_URL_TEST`
  do `api/.env` da cópia.
