# Finanblue — Controle financeiro com Google Sheets

Aplicação full stack para cadastrar, consultar, editar, excluir, filtrar e analisar movimentações financeiras sincronizadas com uma planilha Google Sheets. Sem credenciais, inicia automaticamente com 12 registros de demonstração.

## Tecnologias

- Frontend: React 19, Vite, TypeScript, React Router, Axios, React Hook Form, Zod, Recharts, Lucide React e CSS responsivo.
- Backend: Node.js, Express, TypeScript, Google Sheets API, Google Auth Library, Helmet, CORS, rate limit, dotenv e Zod.

## Pré-requisitos e instalação

- Node.js 20 ou superior e npm.
- Uma conta Google Cloud é necessária apenas para dados reais.

Na raiz do projeto:

```bash
npm install
npm run dev
```

Os npm workspaces instalam automaticamente as dependências de `client` e `server`. A interface abre em `http://localhost:5173` e a API em `http://localhost:3333`. Para produção:

```bash
npm run build
npm start
```

## Configurar o Google Sheets

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou selecione um projeto.
2. Em **APIs e serviços > Biblioteca**, procure e ative **Google Sheets API**.
3. Em **IAM e administrador > Contas de serviço**, crie uma conta de serviço.
4. Abra a conta, acesse **Chaves > Adicionar chave > Criar nova chave > JSON**.
5. Copie `server/.env.example` para `server/.env` e preencha os valores do JSON. Não envie esse arquivo ao Git.
6. Crie a aba `Movimentacoes` e compartilhe a planilha, como **Editor**, com o `client_email` da conta de serviço.
7. Reinicie `npm run dev`. O backend passa automaticamente do modo demonstração para o modo Google Sheets.

Variáveis do backend:

```env
PORT=3333
CLIENT_URL=http://localhost:5173
GOOGLE_SHEETS_SPREADSHEET_ID=ID_ENTRE_D_E_EDIT
GOOGLE_SHEETS_TRANSACTIONS_RANGE=Movimentacoes!A:I
GOOGLE_SERVICE_ACCOUNT_EMAIL=conta@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE\n-----END PRIVATE KEY-----\n"
```

O frontend aceita opcionalmente `VITE_API_URL=/api` em `client/.env`. A chave privada fica exclusivamente no backend. Quebras `\n` são convertidas antes da autenticação.

## Estrutura da planilha

A primeira linha de `Movimentacoes` deve ser exatamente:

```text
ID | Data | Descrição | Categoria | Tipo | Valor | Forma de Pagamento | Status | Observação
```

Tipos válidos: `income`, `expense`. Status válidos: `paid`, `pending`, `cancelled`. Datas usam `AAAA-MM-DD`; valores são numéricos. O sistema valida o cabeçalho e remove a linha correspondente ao ID em exclusões.

## API

| Método | Rota | Função |
|---|---|---|
| GET | `/api/health` | Estado da API |
| GET | `/api/transactions` | Lista, filtros, ordenação e paginação |
| GET | `/api/transactions/:id` | Detalhe |
| POST | `/api/transactions` | Criação |
| PUT | `/api/transactions/:id` | Edição |
| DELETE | `/api/transactions/:id` | Exclusão |
| GET | `/api/dashboard/summary` | Indicadores |
| GET | `/api/dashboard/charts` | Séries dos gráficos |
| GET | `/api/sheets/status` | Estado seguro da integração |
| POST | `/api/sheets/test` | Teste de conexão |
| POST | `/api/sheets/sync` | Sincronização imediata |

Filtros aceitos: `search`, `type`, `category`, `paymentMethod`, `status`, `startDate`, `endDate`, `minValue`, `maxValue`, `sortBy`, `sortOrder`, `page` e `limit`.

## Funcionalidades

- Dashboard com oito indicadores, quatro gráficos e movimentações recentes.
- CRUD completo, busca, filtros persistidos na URL, paginação, resumo e CSV.
- Formulários validados em tempo real no cliente e novamente na API.
- Categorias locais editáveis, preparadas para futura persistência remota.
- Integração segura, teste, sincronização, contagem e última atualização.
- Estados de carregamento, vazio e erro; toast; confirmação de exclusão; layout móvel.
- Helmet, CORS restrito, rate limit, limite de payload e erros sanitizados.

## Erros comuns

- **Cabeçalhos inválidos:** confira grafia, acentos e ordem da primeira linha.
- **Aba não encontrada:** confirme `Movimentacoes!A:I` e o nome exato da aba.
- **Permissão negada:** compartilhe a planilha como Editor com a conta de serviço.
- **Chave inválida:** mantenha aspas e `\n` em `GOOGLE_PRIVATE_KEY`.
- **Porta ocupada:** altere `PORT`; se mudar a API, ajuste também o proxy do Vite.
- **PowerShell bloqueia npm.ps1:** execute `npm.cmd install` e `npm.cmd run dev`.

## Estrutura

```text
.
├── client/
│   ├── src/{services,types,utils}/
│   ├── src/App.tsx
│   ├── src/styles.css
│   └── vite.config.ts
├── server/
│   ├── src/{data,schemas,services,types}/
│   └── src/server.ts
├── package.json
└── README.md
```
