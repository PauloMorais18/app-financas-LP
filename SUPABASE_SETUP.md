# Configuração do Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e execute.
3. Em **Authentication > URL Configuration**, configure a URL do site publicado e adicione a URL local, por exemplo `http://localhost:5180`.
4. Em **Authentication > Providers > Email**, mantenha o provedor Email habilitado. Escolha se novos cadastros precisarão confirmar o e-mail.
5. Em **Project Settings > API**, copie a Project URL e a chave `publishable` (ou `anon` em projetos antigos).
6. No Vercel, abra **Project Settings > Environment Variables** e cadastre:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

7. Marque Production, Preview e Development e faça um novo deploy.

Não coloque a chave `service_role` no frontend ou no Vercel deste projeto. O acesso é feito com a chave pública, e as políticas RLS do script isolam os dados por usuário autenticado.
