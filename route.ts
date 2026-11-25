import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Recebe uma URL arrastada para o quadro e:
 *  - se for imagem: baixa e guarda uma cópia no Storage (o link original pode expirar)
 *  - se for página: procura a imagem de capa (og:image) e devolve um card de link
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  let body: { url?: string; boardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const { url, boardId } = body;
  if (!url || !boardId) return NextResponse.json({ error: "faltou url ou boardId" }, { status: 400 });

  const target = safeUrl(url);
  if (!target) return NextResponse.json({ error: "url não permitida" }, { status: 400 });

  try {
    const res = await fetchWithTimeout(target.toString());
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

    if (ALLOWED.includes(ct)) {
      const src = await storeImage(supabase, res, ct, boardId);
      return NextResponse.json({ kind: "image", url: src, source: target.toString() });
    }

    if (ct.includes("html")) {
      const html = (await res.text()).slice(0, 600_000);
      const title = meta(html, "og:title") || meta(html, "twitter:title") || titleTag(html);
      const og = meta(html, "og:image") || meta(html, "twitter:image");
      let image: string | undefined;
      if (og) {
        const ogUrl = safeUrl(new URL(decodeEntities(og), target).toString());
        if (ogUrl) {
          try {
            const imgRes = await fetchWithTimeout(ogUrl.toString());
            const imgCt = (imgRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            if (ALLOWED.includes(imgCt)) image = await storeImage(supabase, imgRes, imgCt, boardId);
          } catch {
            /* sem capa, segue só com o link */
          }
        }
      }
      return NextResponse.json({ kind: "link", url: target.toString(), title, image });
    }

    return NextResponse.json({ kind: "link", url: target.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "falha ao baixar" }, { status: 502 });
  }
}

async function storeImage(supabase: any, res: Response, ct: string, boardId: string) {
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("imagem maior que 15 MB");
  const path = `${boardId}/${crypto.randomUUID()}.${EXT[ct]}`;
  const { error } = await supabase.storage.from("moodboard").upload(path, buf, { contentType: ct });
  if (error) throw new Error(error.message);
  return supabase.storage.from("moodboard").getPublicUrl(path).data.publicUrl as string;
}

async function fetchWithTimeout(url: string, ms = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "image/avif,image/webp,image/*,text/html;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Bloqueia endereços internos (proteção básica contra SSRF). */
function safeUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0") return null;
  if (h.startsWith("[")) return null; // IPv6 literal
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
      return null;
  }
  return u;
}

function meta(html: string, key: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = attr(tag, "property") || attr(tag, "name");
    if (name && name.toLowerCase() === key) {
      const c = attr(tag, "content");
      if (c) return decodeEntities(c.trim());
    }
  }
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? m[2] ?? m[3] ?? m[4] : undefined;
}

function titleTag(html: string) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
