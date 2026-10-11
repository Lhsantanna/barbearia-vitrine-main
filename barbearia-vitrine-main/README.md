# Vitrine RA Barbearia

## Estado atual

As alterações da vitrine, das rotas de agendamento e do painel ADM estão salvas localmente nesta pasta de trabalho. Elas ainda não foram enviadas ao GitHub nem implantadas na Vercel. A URL publicada anteriormente ainda responde `404` em `/api/create-booking`; portanto, o pagamento do sinal ainda não está disponível no site público.

Este ambiente não contém o executável Git e a pasta de trabalho não está conectada a um repositório GitHub. Use as instruções abaixo para publicar os arquivos. Não envie chaves, tokens ou arquivos `.env` ao GitHub.

## Enviar ao GitHub

A pasta de trabalho que contém **vitrine**, **ADM** e `.vscode` é:

`C:\Users\Lhsoludev\Downloads\barbearia-vitrine-main`

Se o repositório GitHub já existir, instale o **Git for Windows** e o **GitHub Desktop**, abra essa pasta no GitHub Desktop e escolha **Add an Existing Repository** somente se ela já tiver sido inicializada como Git; caso contrário, inicialize um repositório Git nessa pasta e conecte a URL do repositório remoto existente. Confira a lista de arquivos antes de confirmar as alterações.

Se ainda não existir repositório, no GitHub Desktop escolha **File → Add Local Repository → Create a Repository**, selecione a pasta acima e publique em **Publish repository**. Mantenha o repositório privado enquanto os dados comerciais e o painel ADM não estiverem prontos para divulgação.

Alternativamente, após instalar Git for Windows, abra o PowerShell e execute os comandos abaixo. Substitua a URL pela URL do repositório criado na sua conta GitHub. Se a pasta já tiver um repositório, não execute `git init`; use o repositório existente.

```powershell
Set-Location 'C:\Users\Lhsoludev\Downloads\barbearia-vitrine-main'
git init
git add .
git status --short
git commit -m "Salva melhorias da vitrine e agendamento"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Antes de `git commit`, confirme com `git status --short` que `node_modules` e qualquer arquivo `.env` não estão na lista. O `.gitignore` da vitrine já exclui esses itens e mantém `.env.example`, que contém apenas nomes de variáveis sem valores secretos.

## Deploy na Vercel

Conecte o repositório GitHub à Vercel. Como o repositório inclui a pasta do ADM, configure `barbearia-vitrine-main` como **Root Directory** do projeto Vercel; essa pasta contém a vitrine e as rotas seguras de disponibilidade, checkout e webhook.
O projeto requer Node.js 22 ou superior, conforme definido em `engines` no `package.json`.

Defina estas variáveis em **Vercel → Project → Settings → Environment Variables**:

- `PUBLIC_SITE_URL`: URL HTTPS pública da vitrine.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`: credenciais de uma conta de serviço do Firebase com acesso ao Firestore do painel.
- `MERCADOPAGO_ACCESS_TOKEN`: token privado da conta Mercado Pago do estabelecimento.
- `MERCADOPAGO_WEBHOOK_SECRET`: segredo de assinatura do webhook configurado no Mercado Pago.

Não use credenciais de produção no código do navegador, no repositório ou no arquivo `.env.example`. Cadastre os valores apenas no cofre de variáveis da Vercel e faça novo deploy após configurá-los.

No painel de desenvolvedor do Mercado Pago, cadastre a notificação de pagamentos apontando para `https://seu-dominio/api/mercadopago-webhook` e habilite eventos de pagamentos. Copie o segredo de assinatura dessa notificação para `MERCADOPAGO_WEBHOOK_SECRET`.

O checkout cobra R$ 15,00 por agendamento. O valor é descontado do preço do serviço. O horário fica temporariamente reservado por 30 minutos e só aparece como confirmado após o webhook validar um pagamento aprovado. A Vercel API grava e verifica a agenda usando uma conta de serviço; a vitrine não grava diretamente no Firestore.

## Painel ADM

O painel continua lendo a coleção `agendamentos` existente. Os novos registros usam o profissional compatível com a agenda atual (`barbeiro`) e preservam o nome escolhido em `barbeiroNome`. O ADM atualizado exibe o status do sinal, o método de pagamento e o nome/e-mail do pagador; pagamentos ainda pendentes ou expirados não entram nos relatórios de faturamento.

## Pré-visualização

Sirva esta pasta por um servidor HTTP local. Os módulos de navegador e as rotas `/api/*` não funcionam abrindo o HTML diretamente por `file://`. O checkout real requer as variáveis de ambiente acima.
