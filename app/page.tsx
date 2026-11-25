import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function createBoard() {
  "use server";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .insert({ title: "Novo moodboard" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar o quadro");
  redirect(`/b/${data.id}`);
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: boards } = await supabase
    .from("boards")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  // Capa de cada quadro: a imagem mais recente dele
  const ids = (boards ?? []).map((b) => b.id);
  const covers: Record<string, string> = {};
  if (ids.length) {
    const { data: imgs } = await supabase
      .from("items")
      .select("board_id, content, created_at")
      .in("board_id", ids)
      .eq("type", "image")
      .order("created_at", { ascending: false })
      .limit(500);
    for (const i of imgs ?? []) {
      if (!covers[i.board_id]) covers[i.board_id] = (i.content as any)?.src;
    }
  }

  return (
    <main className="home">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="muted">{user?.email}</span>
          <form action="/auth/signout" method="post">
            <button className="btn ghost">Sair</button>
          </form>
        </div>
      </header>

      <section className="home-body">
        <div className="home-head">
          <h1>Quadros</h1>
          <form action={createBoard}>
            <button className="btn primary">+ Novo moodboard</button>
          </form>
        </div>

        {!boards?.length ? (
          <p className="muted empty">Nenhum quadro ainda. Crie o primeiro.</p>
        ) : (
          <div className="grid">
            {boards.map((b) => (
              <Link key={b.id} href={`/b/${b.id}`} className="card">
                <div
                  className="card-cover"
                  style={covers[b.id] ? { backgroundImage: `url("${covers[b.id]}")` } : undefined}
                />
                <div className="card-info">
                  <strong>{b.title}</strong>
                  <small className="muted">
                    {new Date(b.updated_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
