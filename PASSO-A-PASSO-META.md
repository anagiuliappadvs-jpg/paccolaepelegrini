# Passo-a-passo: configurar o Instagram/Meta

Faca uma vez. No fim voce tera 4 coisas para colar no arquivo `.env`:
**token**, **ID da conta**, **ID do app** e **segredo do app**.

> Dica: pode me chamar e fazer junto. Voce clica, eu te digo exatamente o
> proximo passo, e me devolve os numeros que aparecerem.

---

## Parte A - Preparar a conta (so se ainda nao estiver assim)

1. A conta do Instagram da empresa precisa ser **Profissional** (Comercial ou
   Criador), nao pessoal.
   - No app do Instagram: Configuracoes -> Tipo de conta -> mudar para
     **Profissional**.
2. Ela precisa estar **vinculada a uma Pagina do Facebook**.
   - Se nao tiver uma Pagina, crie uma simples em facebook.com/pages/create.
   - No Instagram, em Configuracoes -> vincular a Pagina do Facebook.

## Parte B - Criar o app no Meta for Developers

3. Entre em **developers.facebook.com** e faca login com o Facebook da empresa.
4. Aceite virar desenvolvedor (se pedir) e clique em **Meus Apps -> Criar App**.
5. Tipo do app: escolha **Empresa (Business)**. De um nome (ex.: "Dashboard
   Instagram") e crie.
6. No painel do app, em **Adicionar produtos**, adicione a **Instagram Graph
   API** (ou "Instagram").

## Parte C - Gerar o token e pegar os IDs

7. No menu, va em **Ferramentas -> Explorador da API de Gráficos** (Graph API
   Explorer).
8. Em "Aplicativo Meta", selecione o seu app.
9. Clique em **Gerar token de acesso** e, quando pedir as permissoes, marque:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_read_engagement`
   - `pages_show_list`
10. Faca login/autorize. Vai aparecer um **token** (texto longo). Guarde.
11. Ainda no Explorador, digite no campo de consulta: `me/accounts` e clique em
    Enviar. Vai aparecer o **ID da sua Pagina**. Copie esse ID.
12. Agora digite: `SEU_ID_DA_PAGINA?fields=instagram_business_account`
    (troque pelo ID do passo 11) e Envie. Vai aparecer o
    **instagram_business_account.id** -> esse e o **ID da conta** (IG_USER_ID).

13. Pegue o **ID e o Segredo do app**: no painel do app, em
    **Configuracoes -> Basico**, copie o **ID do aplicativo** e o
    **Chave secreta do aplicativo** (clique em Mostrar).

## Parte D - Colocar no .env e testar

14. Me avise que voce tem os 4 valores. Eu crio o arquivo `.env` com voce e
    rodamos o coletor. Ele tambem ja **estende o token para ~60 dias**
    automaticamente.

---

### Os 4 valores (preencha aqui se quiser, depois apago)

- Token (passo 10): ______________________________________
- ID da conta / IG_USER_ID (passo 12): ___________________
- ID do app (passo 13): __________________________________
- Segredo do app (passo 13): _____________________________
