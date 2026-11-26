# Arquitetura

```
web/ (React + Vite) --HTTP--> api/src/http/ --> api/src/services/ --> api/src/repositories/ --> Postgres
                                                        |                    (Prisma Client)
                                                        +--> api/src/integrations/ (IA fake ou OpenAI)
api/src/jobs/triage-worker.ts --> api/src/services/triage-service.ts --> api/src/repositories/
```

Todas as camadas podem usar `api/src/domain/` (tipos, `DomainError`, `formatTicketRef`) e
`api/src/config/` (o único lugar que lê variável de ambiente).

## Camadas da API

| Pasta | Responsabilidade | Não pode |
|---|---|---|
| `api/src/http/` | Rotas, middlewares, tradução de erro para status (`errors.ts`) | Importar `repositories/` ou `@prisma/client` (G4) |
| `api/src/services/` | Regras de negócio; recebem repositórios e funções por construtor | Importar express, multer ou `http/`, nem só o tipo (G6) |
| `api/src/repositories/` | Acesso a dados; único dono do Prisma Client (`prisma.ts`) | Ser contornado: Prisma fora daqui acende a G12 |
| `api/src/integrations/` | Cliente de IA (fake por padrão, OpenAI com `AI_MODE=openai`) | Ter o SDK openai importado em outro lugar (G7) |
| `api/src/config/` | Ler `process.env` e definir padrões (porta, CORS, pasta de anexos) | Ter variável lida fora dela (G5) |
| `api/src/domain/` | Tipos, erros de negócio, funções puras | Depender de qualquer outra camada |

## Montagem (composition root)

`api/src/main.ts` monta repositórios -> serviços e entrega os serviços prontos para `createApp`
(`api/src/http/app.ts`). As rotas são fábricas (`ticketRoutes(deps)`, `statsRoutes(stats)`...) e nunca
instanciam nada. `api/src/jobs/triage-worker.ts` faz o mesmo para o worker: `TriageService` com o
`ticketRepository` e o `classifyTicket` da integração.

## Erros

Os serviços lançam `DomainError(code, message)`. Os códigos são `validation_error`, `forbidden`,
`not_found`, `invalid_transition`, `file_too_large` e `unsupported_type`. `api/src/http/errors.ts` é o
único lugar que conhece o status de cada código (422, 403, 404, 409, 413, 415) e responde sempre no
formato `{"error": "<código>", "message": "..."}`. Erros que nascem na própria camada HTTP (token,
e-mail já cadastrado, credenciais inválidas) usam `HttpError`.

## Onde mexer

- **Rota nova**: na fábrica do recurso em `api/src/http/routes/`, chamando um serviço. Lembre que a API
  é contrato: a suíte `blackbox/` não pode quebrar.
- **Regra de negócio**: um serviço em `api/src/services/` com teste ao lado (`*.test.ts`), usando
  repositórios falsos (veja `ticket-service.test.ts`).
- **Consulta nova ao banco**: um método no repositório e na interface que o serviço recebe.
- **Variável de ambiente nova**: em `api/src/config/` (ou `web/src/config/`) e no `api/.env.example`;
  se for um endereço por cópia, gere em `scripts/ambiente.mjs`.

## Front

`web/src/api/` fala com a API via `fetch` (`client.ts`). Os tipos do contrato ficam em
`web/src/api/tickets.ts`, e o endereço da API em `web/src/config/env.ts` (`VITE_API_URL`, gravado pelo
`npm run up`). O front não importa nada de `api/` (G8).
