# Finanbase

Aplicação financeira full stack com React, Vite, Express e Google Sheets. O frontend também funciona como PWA instalável.

## Desenvolvimento local

Requer Node.js 20 ou superior.

```powershell
npm.cmd install
npm.cmd run dev
```

- Frontend: `http://127.0.0.1:5180`
- API: `http://localhost:3333/api/health`

O comando `npm run dev` mantém o frontend Vite e o backend Express ativos em paralelo. O servidor local é iniciado por `server/src/local.ts`; a aplicação Express e todas as rotas permanecem em `server/src/server.ts`.

## Google Sheets

Para desenvolvimento local, crie o arquivo `.env` na raiz:

```env
GOOGLE_SHEET_ID=seu_id_da_planilha
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-service-account.json
```

Coloque a chave da Service Account em `credentials/google-service-account.json` e compartilhe a planilha como Editor com o `client_email` desse arquivo. A pasta `credentials/` é ignorada pelo Git.

As abas obrigatórias são:

- `Usuarios`
- `Movimentacoes`
- `FontesRenda`
- `Empresas`
- `Pedidos`
- `Listas`
- `Instrucoes`

## Build local

```powershell
npm.cmd run build
npm.cmd start
```

O build gera o frontend em `dist`, o service worker do PWA e o backend local em `server/dist`.

## Deploy na Vercel

O entrypoint serverless está em `api/index.ts` e apenas exporta a mesma aplicação Express usada localmente. O arquivo `vercel.json` configura o build Vite, a Function da API, o encaminhamento de `/api/*` e o fallback do React Router.

Importe o repositório do GitHub na Vercel com a raiz do projeto como **Root Directory**. Não é necessário definir manualmente Build Command ou Output Directory, pois ambos já estão em `vercel.json`.

Configure estas variáveis em **Settings → Environment Variables**:

```env
GOOGLE_SHEET_ID=seu_id_da_planilha
GOOGLE_SERVICE_ACCOUNT_JSON={conteudo_completo_do_json_da_service_account}
```

`GOOGLE_SERVICE_ACCOUNT_JSON` deve conter o JSON completo em uma única variável. Como alternativas, o backend também aceita:

```env
GOOGLE_APPLICATION_CREDENTIALS={conteudo_completo_do_json}
```

ou:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Não envie o arquivo `credentials/google-service-account.json` ao GitHub. Depois de cadastrar ou alterar variáveis na Vercel, faça um novo deploy.

## Rotas

Todas as rotas existentes continuam sob `/api`, incluindo:

- `/api/health`
- `/api/users`
- `/api/income-sources`
- `/api/companies`
- `/api/orders`
- `/api/transactions`
- `/api/dashboard/summary`
- `/api/dashboard/charts`
- `/api/sheets/status`
- `/api/sheets/test`
- `/api/sheets/sync`
