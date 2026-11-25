# Moodboard · Engenharia Filmes

Plataforma interna de moodboards no estilo Milanote: quadro infinito onde a equipe arrasta imagens de qualquer lugar (Google Imagens, Pinterest, sites, computador), escreve notas e compartilha um link com o cliente.

## O que já funciona

- **Login com e-mail e senha** — só entra quem vocês convidarem (sem cadastro aberto).
- **Lista de quadros** com capa automática (última imagem adicionada).
- **Quadro infinito**: arrastar o fundo para mover, scroll/trackpad para navegar, Ctrl/Cmd + scroll (ou pinça) para zoom, botão ⤢ para enquadrar tudo.
- **Arrastar de qualquer lugar**:
  - imagem do Google Imagens → tenta pegar a versão **original em alta**; se não der, usa a miniatura;
  - imagem do Pinterest/sites → pega a maior versão disponível (`srcset`);
  - arquivo do computador → upload direto;
  - link de página (YouTube, Behance, Vimeo…) → vira um card com capa e título;
  - texto solto → vira nota.
- **Colar com Ctrl/Cmd+V**: print, imagem copiada, link ou texto.
- As imagens são **copiadas para o Storage** de vocês — o quadro não quebra se o link original sair do ar.
- **Notas** (duplo clique no fundo) com 5 cores.
- Mover, redimensionar (imagem mantém proporção), trazer pra frente, apagar (botão × ou Delete).
- **Tempo real**: se dois sócios estão no mesmo quadro, um vê o outro mexendo.
- **Link público somente leitura** (`/s/...`) para mandar ao cliente, com botão para desativar.

## Stack

- **Next.js 15** (App Router) — hospedado na **Vercel** (plano grátis serve).
- **Supabase** — login, banco Postgres, Storage das imagens e tempo real (plano grátis serve para começar: 500 MB de banco, 1 GB de Storage).

---

## Passo a passo para colocar no ar

### 1. Supabase (banco + login + imagens)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região **São Paulo**).
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**.
3. Vá em **Authentication → Sign In / Providers**:
   - deixe **Email** ligado;
   - **desligue "Allow new users to sign up"** (assim ninguém de fora cria conta).
4. Crie os usuários da equipe em **Authentication → Users → Add user → Create new user** (e-mail + senha, marque "Auto confirm"). Ou use **Invite user** para a pessoa definir a própria senha.
5. Em **Project Settings → API** copie: `Project URL`, `anon public` e `service_role` (essa última é secreta).

### 2. GitHub

```bash
cd ef-moodboard
git init
git add .
git commit -m "Moodboard Engenharia Filmes"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/ef-moodboard.git
git push -u origin main
```

(Crie o repositório vazio antes em github.com → New repository. Pode deixar **privado**.)

### 3. Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório.
2. Em **Environment Variables**, cadastre as três:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |

3. **Deploy**. Em 1–2 minutos o site fica em `ef-moodboard.vercel.app`.
4. (Opcional) Em **Settings → Domains** coloque algo como `moodboard.engenhariafilmes.com.br`.
5. Volte ao Supabase em **Authentication → URL Configuration** e coloque o endereço final em **Site URL** (necessário para os e-mails de convite apontarem pro lugar certo).

A cada `git push` na `main`, a Vercel publica a versão nova sozinha.

### Rodar no computador (opcional)

```bash
cp .env.example .env.local   # e preencha as chaves
npm install
npm run dev                  # abre em http://localhost:3000
```

---

## Estrutura

```
app/
  login/              tela de login
  page.tsx            lista de quadros
  b/[id]/             quadro (equipe, editável)
  s/[token]/          quadro compartilhado (cliente, só leitura)
  api/import-image/   baixa imagens/links arrastados e salva no Storage
components/
  BoardCanvas.tsx     o quadro: arrastar/soltar, colar, zoom, notas, tempo real
supabase/schema.sql   tabelas, permissões e bucket de imagens
```

## Limitações conhecidas (é um esboço)

- **Instagram e alguns sites bloqueiam** download direto de imagem. Nesses casos, use print + Ctrl/Cmd+V ou arraste o arquivo salvo.
- Se o Google só entregar a miniatura, a imagem vem em baixa — clicar na imagem no Google antes de arrastar (painel lateral aberto) costuma trazer a versão grande.
- Todos os logados veem todos os quadros (pensado para os sócios/equipe). Pastas por cliente ou permissões por quadro ficam para a próxima versão.
- Celular: dá para ver e mover, mas zoom com pinça ainda não está implementado.
- Proteção contra endereços internos no importador é básica; suficiente para uso interno.

## Próximas ideias

Pastas/colunas por projeto, legenda nas imagens, seleção múltipla, desfazer (Ctrl+Z), comentários do cliente no link público, upload de vídeo, extensão de navegador "salvar no moodboard", exportar quadro em PDF.
