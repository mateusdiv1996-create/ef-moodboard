import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import BoardCanvas from "@/components/BoardCanvas";

export const dynamic = "force-dynamic";

/** Link público, somente leitura — para mandar ao cliente sem precisar de login. */
export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: board } = await supabase
    .from("boards")
    .select("id, title, share_token, share_enabled")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .single();
  if (!board) notFound();

  const { data: items } = await supabase
    .from("items")
    .select("id, board_id, type, x, y, w, h, z, content")
    .eq("board_id", board.id)
    .order("z");

  return <BoardCanvas board={board} initialItems={items ?? []} readOnly />;
}
