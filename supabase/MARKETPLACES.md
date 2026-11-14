# Marketplaces

Execute `migration/20261113_marketplaces.sql` no SQL Editor do projeto Supabase usado pelo aplicativo, ap?s o schema principal e as migra??es de autentica??o. N?o ? necess?rio reaplicar o schema principal.

Os cadastros e eventos pertencem ao grupo. Membros podem consultar; somente o propriet?rio pode cadastrar e editar por meio da fun??o transacional `save_marketplace`. As credenciais ficam no schema privado `marketplace_private`, sem permiss?o de leitura para clientes. Valores vazios na edi??o preservam as credenciais existentes. A fun??o n?o retorna segredos e os eventos n?o incluem credenciais.

O monitor consulta os ?ltimos 100 eventos do grupo a cada 15 segundos, enquanto a p?gina est? vis?vel. Ainda n?o existem autentica??o OAuth, chamadas aos provedores, webhooks, importa??o de pedidos ou sincroniza??o de vendas. Credenciais salvas n?o significam conex?o autenticada. A ?rea privada dever? ser acessada exclusivamente pelo backend quando essas integra??es forem implementadas.
