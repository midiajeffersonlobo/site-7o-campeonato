# Deploy da function `gerar-pdf` no Supabase

Essa function guarda a chave da CloudConvert em segredo no servidor — o site nunca vê a chave, só chama essa function.

## 1. Criar o projeto no Supabase (se ainda não tiver um)

1. Acesse https://supabase.com e crie uma conta / faça login
2. Crie um novo projeto (qualquer nome, região mais próxima do Brasil)
3. Anote a **Project URL** (algo como `https://xxxxxxxxx.supabase.co`) — vai precisar dela no passo 4

## 2. Instalar a CLI do Supabase

No PowerShell:

```
npm install -g supabase
```

## 3. Login e link com o projeto

Na pasta do site (`conbraks-2026-site`), rode:

```
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

O `SEU_PROJECT_REF` é o trecho antes de `.supabase.co` na Project URL (ex: se a URL é `https://xxxxxxxxx.supabase.co`, o ref é `xxxxxxxxx`).

## 4. Guardar a chave da CloudConvert como secret

```
supabase secrets set CLOUDCONVERT_API_KEY="cole_a_chave_aqui"
```

A chave nunca fica no código — só nesse secret, do lado do servidor.

## 5. Deploy da function

A function já está pronta em `supabase/functions/gerar-pdf/index.ts`. Pra publicar:

```
supabase functions deploy gerar-pdf --no-verify-jwt
```

O `--no-verify-jwt` é necessário porque o site vai chamar essa function sem login de usuário (é uma function pública, qualquer visitante do site pode gerar o PDF).

## 6. Pegar a URL final da function

Depois do deploy, a URL da function é:

```
https://SEU_PROJECT_REF.supabase.co/functions/v1/gerar-pdf
```

## 7. Colar essa URL no site

Abra o arquivo `js/gerar-pdf.js` e edite a linha bem no topo:

```js
const SUPABASE_FUNCTION_URL = 'COLE_AQUI_A_URL_DO_PASSO_6';
```

Salve, publique o site de novo no Vercel, e pronto — o botão "Gerar PDF" já vai funcionar de ponta a ponta.

## Testando localmente (opcional)

Antes de fazer deploy, dá pra testar a function na sua máquina:

```
supabase functions serve gerar-pdf --no-verify-jwt --env-file ./supabase/.env
```

Crie um arquivo `supabase/.env` (não versionar/compartilhar esse arquivo) com:

```
CLOUDCONVERT_API_KEY=cole_a_chave_aqui
```

E aponte `SUPABASE_FUNCTION_URL` temporariamente pra `http://localhost:54321/functions/v1/gerar-pdf` durante o teste.
