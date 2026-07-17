# Finanbase

Aplicação financeira full stack para controlar ganhos e despesas usando uma planilha Excel como banco de dados por meio de uma API externa.

## Executar

Requer Node.js 20 ou superior. Na raiz do projeto:

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend: `http://127.0.0.1:5180`  
API: `http://localhost:3333/api/health`

Sem uma API configurada, a aplicação funciona com dados locais de demonstração. A conexão é configurada dentro do app em **Configurações**.

## Contrato esperado da API do Excel

A URL informada no aplicativo será usada com estas rotas:

```text
GET    /workbooks/:workbookId/worksheets/:worksheet/transactions
POST   /workbooks/:workbookId/worksheets/:worksheet/transactions
PUT    /workbooks/:workbookId/worksheets/:worksheet/transactions/:id
DELETE /workbooks/:workbookId/worksheets/:worksheet/transactions/:id
```

O token é enviado nos cabeçalhos `Authorization: Bearer <token>` e `X-API-Key`. A resposta da listagem pode ser um array ou `{ "data": [...] }`.

Cada movimentação possui: `id`, `date`, `description`, `type`, `value`, `recurring`, `owner`, `observation`, `category`, `paymentMethod` e `status`.

As credenciais são salvas somente no backend, em um arquivo ignorado pelo Git. A chave nunca é devolvida para o navegador.

## Produção

```powershell
npm.cmd run build
npm.cmd start
```
