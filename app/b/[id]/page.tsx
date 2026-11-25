import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BoardCanvas from "@/components/BoardCanvas";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: board } = await supabase
    .from("boards")
    .select("id, title, share_token, share_enabled")
    .eq("id", id)
    .single();
  if (!board) notFound();

  const { data: items } = await supabase
    .from("items")
    .select("id, board_id, type, x, y, w, h, z, content")
    .eq("board_id", id)
    .order("z");

  return <BoardCanvas board={board} initialItems={items ?? []} />;
}
