# Configuração de acesso

1. Execute `supabase/schema.sql` e depois `migration/20261102_auth_isolation.sql` no SQL Editor. Não reaplique o schema antigo depois da migração de segurança.
2. Em Authentication / Providers, habilite Google e configure Client ID e Client Secret do Google Cloud. Cadastre no Google a URL de callback indicada pelo Supabase.
3. Em URL Configuration, configure Site URL e permita a origem exata da aplicação em Redirect URLs. Evite curingas em produção.
4. Habilite confirmação de e-mail. Configure SMTP próprio e limites de envio/tentativas para produção.
5. No template Reset Password, inclua `<p>Seu código de recuperação: {{ .Token }}</p>`. Esta tela usa código, não link. Ajuste expiração de OTP no Supabase.
6. Use apenas URL e chave publicável no frontend. Nunca exponha service_role.

A chaveusuario exibida no perfil é o UUID imutável do usu?rio autenticado. No cadastro ela ? gerada pelo Supabase. No login ? opcional para compatibilidade; quando preenchida, deve corresponder ? conta. Ela não é senha nem concessóo de acesso. Os grupos continuam sendo os espa?os compartilhados e a RLS valida associação ao grupo. A definição de uma chave comercial por empresa ainda precisa ser confirmada.

A API antiga de Sheets responde 410, exceto /api/health, porque usava senha fixa e não oferece isolamento suficiente. O frontend já usa Supabase diretamente.

Validação de publica??o: testar cadastro com confirmação, primeiro acesso Google e retorno OAuth, recuperação com código correto/incorreto/expirado, login em duas contas de grupos distintos, tentativas REST de ler/editar/excluir IDs de outro grupo e de vincular produto/cliente/fonte de outro grupo. Verificar planos EXPLAIN com volume real. índices não substituem paginação: os dashboards atuais ainda carregam registros do grupo no navegador.

Imagens de produtos continuam públicas no bucket existente; não armazenar documentos confidenciais ali. A migração protege os dados relacionais, mas não converte esse bucket para privado.
