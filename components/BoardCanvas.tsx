"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Board, Item } from "@/lib/types";
import { LogoIcon } from "./Logo";

type View = { x: number; y: number; scale: number };
type Interaction =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: "resize"; id: string; sx: number; sy: number; ow: number; oh: number; keepRatio: boolean }
  | null;

const NOTE_COLORS = ["#f4ecd8", "#e3eddc", "#dde7f0", "#f1dede", "#2a2a2a"];
const MAX_IMG_W = 340;

export default function BoardCanvas({
  board,
  initialItems,
  readOnly = false,
}: {
  board: Board;
  initialItems: Item[];
  readOnly?: boolean;
}) {
  const supabase = useMemo(() => (readOnly ? null : createClient()), [readOnly]);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState(board.title);
  const [share, setShare] = useState({ token: board.share_token, enabled: board.share_enabled });
  const [shareOpen, setShareOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const interaction = useRef<Interaction>(null);
  const itemsRef = useRef(items);
  const viewRef = useRef(view);
  itemsRef.current = items;
  viewRef.current = view;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  // ---------- coordenadas ----------
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale };
  }, []);

  const viewportCenter = useCallback(() => {
    const rect = containerRef.current!.getBoundingClientRect();
    return toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [toCanvas]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    const list = itemsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!list.length) {
      setView({ x: rect.width / 2, y: rect.height / 2, scale: 1 });
      return;
    }
    const minX = Math.min(...list.map((i) => i.x));
    const minY = Math.min(...list.map((i) => i.y));
    const maxX = Math.max(...list.map((i) => i.x + i.w));
    const maxY = Math.max(...list.map((i) => i.y + i.h));
    const pad = 80;
    const scale = Math.min(1, (rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY));
    setView({
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
    });
  }, []);

  useEffect(() => {
    fitView();
  }, [fitView]);

  // ---------- persistência ----------
  const maxZ = () => itemsRef.current.reduce((m, i) => Math.max(m, i.z), 0);

  const upsertLocal = useCallback((it: Item) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === it.id);
      if (idx === -1) return [...prev, it];
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...it };
      return next;
    });
  }, []);

  const insertItem = useCallback(
    async (partial: Omit<Item, "id" | "board_id" | "z">) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("items")
        .insert({ ...partial, board_id: board.id, z: maxZ() + 1 })
        .select("id, board_id, type, x, y, w, h, z, content")
        .single();
      if (error || !data) {
        flash("Erro ao salvar item");
        return;
      }
      upsertLocal(data as Item);
      setSelected(data.id);
    },
    [supabase, board.id, flash, upsertLocal]
  );

  const patchItem = useCallback(
    async (id: string, patch: Partial<Item>) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      if (!supabase) return;
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) flash("Erro ao salvar");
    },
    [supabase, flash]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const it = itemsRef.current.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected(null);
      if (!supabase) return;
      await supabase.from("items").delete().eq("id", id);
      // Remove o arquivo do Storage se a imagem foi guardada por nós
      const src: string | undefined = it?.content?.src || it?.content?.image;
      const marker = "/storage/v1/object/public/moodboard/";
      if (src && src.includes(marker)) {
        await supabase.storage.from("moodboard").remove([src.split(marker)[1]]);
      }
    },
    [supabase]
  );

  // ---------- tempo real ----------
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`board-${board.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `board_id=eq.${board.id}` },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
            return;
          }
          const it = payload.new as Item;
          const busyId = interaction.current && "id" in interaction.current ? interaction.current.id : null;
          if (it.id === busyId) return; // não atrapalha quem está arrastando
          upsertLocal(it);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, board.id, upsertLocal]);

  // ---------- adicionar conteúdo ----------
  const measure = (src: string) =>
    new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
      img.onerror = () => resolve({ w: 300, h: 200 });
      img.src = src;
    });

  const addImageAt = useCallback(
    async (src: string, pos: { x: number; y: number }, source?: string, size?: { w: number; h: number }) => {
      const nat = size ?? (await measure(src));
      const w = Math.min(MAX_IMG_W, nat.w);
      const h = Math.round((w * nat.h) / nat.w);
      await insertItem({ type: "image", x: pos.x - w / 2, y: pos.y - h / 2, w, h, content: { src, source } });
    },
    [insertItem]
  );

  const uploadBlob = useCallback(
    async (blob: Blob, pos: { x: number; y: number }) => {
      if (!supabase) return;
      const type = blob.type || "image/png";
      const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/\+.*/, "");
      const path = `${board.id}/${crypto.randomUUID()}.${ext}`;
      const local = URL.createObjectURL(blob);
      const size = await measure(local);
      URL.revokeObjectURL(local);
      const { error } = await supabase.storage.from("moodboard").upload(path, blob, { contentType: type });
      if (error) {
        flash(`Falha no upload: ${error.message}`);
        return;
      }
      const src = supabase.storage.from("moodboard").getPublicUrl(path).data.publicUrl;
      await addImageAt(src, pos, undefined, size);
    },
    [supabase, board.id, addImageAt, flash]
  );

  const importUrl = useCallback(
    async (url: string) => {
      const res = await fetch("/api/import-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, boardId: board.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "falha");
      return (await res.json()) as
        | { kind: "image"; url: string; source: string }
        | { kind: "link"; url: string; title?: string; image?: string };
    },
    [board.id]
  );

  const addNote = useCallback(
    (pos: { x: number; y: number }, text = "") =>
      insertItem({ type: "note", x: pos.x - 110, y: pos.y - 70, w: 220, h: 140, content: { text, color: NOTE_COLORS[0] } }),
    [insertItem]
  );

  /** O coração do "arrasta de qualquer lugar": entende arquivos, imagens de páginas e links. */
  const handleTransfer = useCallback(
    async (dt: DataTransfer, pos: { x: number; y: number }) => {
      // 1) Arquivos (do computador ou imagem copiada)
      const files = Array.from(dt.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        await Promise.all(files.map((f, i) => uploadBlob(f, { x: pos.x + i * 30, y: pos.y + i * 30 })));
        return;
      }

      const html = dt.getData("text/html");
      const pageUrl = firstUrl(dt.getData("text/uri-list")) || firstUrl(dt.getData("text/plain"));
      const text = dt.getData("text/plain");

      // 2) Candidatos a imagem, do melhor para o pior
      const candidates: string[] = [];
      const googleFull = pageUrl ? googleImgUrl(pageUrl) : null;
      if (googleFull) candidates.push(googleFull);
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const img = doc.querySelector("img");
        const anchorHref = doc.querySelector("a")?.getAttribute("href");
        const fromAnchor = anchorHref ? googleImgUrl(absolutize(anchorHref, pageUrl)) : null;
        if (fromAnchor) candidates.push(fromAnchor);
        if (img) {
          const best = bestFromSrcset(img.getAttribute("srcset")) || img.getAttribute("src");
          if (best) candidates.push(absolutize(best, pageUrl));
        }
      }
      if (pageUrl && looksLikeImage(pageUrl)) candidates.push(pageUrl);

      for (const c of Array.from(new Set(candidates))) {
        try {
          if (c.startsWith("data:image/")) {
            await uploadBlob(dataUrlToBlob(c), pos);
            return;
          }
          const r = await importUrl(c);
          if (r.kind === "image") {
            await addImageAt(r.url, pos, pageUrl || c);
            return;
          }
        } catch {
          /* tenta o próximo */
        }
      }

      // 3) Link de página → card com capa
      if (pageUrl) {
        try {
          const r = await importUrl(pageUrl);
          if (r.kind === "image") return void (await addImageAt(r.url, pos, pageUrl));
          return void (await insertItem({
            type: "link",
            x: pos.x - 130,
            y: pos.y - 110,
            w: 260,
            h: r.image ? 230 : 90,
            content: { url: r.url, title: r.title, image: r.image },
          }));
        } catch {
          return void (await insertItem({
            type: "link", x: pos.x - 130, y: pos.y - 45, w: 260, h: 90, content: { url: pageUrl },
          }));
        }
      }

      // 4) Texto solto → nota
      if (text?.trim()) await addNote(pos, text.trim());
    },
    [uploadBlob, importUrl, addImageAt, insertItem, addNote]
  );

  const runTransfer = useCallback(
    async (dt: DataTransfer, pos: { x: number; y: number }) => {
      setBusy((b) => b + 1);
      try {
        await handleTransfer(dt, pos);
      } catch {
        flash("Não consegui importar isso");
      } finally {
        setBusy((b) => b - 1);
      }
    },
    [handleTransfer, flash]
  );

  // Colar (Ctrl/Cmd+V) em qualquer lugar do quadro
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return;
      if (!e.clipboardData) return;
      e.preventDefault();
      runTransfer(e.clipboardData, viewportCenter());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readOnly, runTransfer, viewportCenter]);

  // Apagar com Delete/Backspace
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteItem(selected);
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, selected, deleteItem]);

  // ---------- zoom / navegação ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("textarea")) return;
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.01), 0.1, 4);
        setView({ scale, x: mx - (mx - v.x) * (scale / v.scale), y: my - (my - v.y) * (scale / v.scale) });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const scale = clamp(v.scale * f, 0.1, 4);
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setView({ scale, x: mx - (mx - v.x) * (scale / v.scale), y: my - (my - v.y) * (scale / v.scale) });
  };

  // ---------- arrastar / redimensionar ----------
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = interaction.current;
      if (!it) return;
      const s = viewRef.current.scale;
      if (it.kind === "pan") {
        setView((v) => ({ ...v, x: it.ox + (e.clientX - it.sx), y: it.oy + (e.clientY - it.sy) }));
      } else if (it.kind === "move") {
        const dx = (e.clientX - it.sx) / s;
        const dy = (e.clientY - it.sy) / s;
        if (Math.abs(dx) + Math.abs(dy) > 2) it.moved = true;
        setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, x: it.ox + dx, y: it.oy + dy } : i)));
      } else if (it.kind === "resize") {
        const w = Math.max(60, it.ow + (e.clientX - it.sx) / s);
        const h = it.keepRatio ? (w * it.oh) / it.ow : Math.max(50, it.oh + (e.clientY - it.sy) / s);
        setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, w, h } : i)));
      }
    };
    const onUp = () => {
      const it = interaction.current;
      interaction.current = null;
      if (!it || it.kind === "pan") return;
      const cur = itemsRef.current.find((i) => i.id === it.id);
      if (!cur) return;
      if (it.kind === "move") patchItem(it.id, { x: cur.x, y: cur.y, z: cur.z });
      if (it.kind === "resize") patchItem(it.id, { w: cur.w, h: cur.h });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [patchItem]);

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setSelected(null);
    setShareOpen(false);
    interaction.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
  };

  const onItemDown = (e: React.PointerEvent, it: Item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(it.id);
    if (readOnly) return;
    const z = it.z >= maxZ() ? it.z : maxZ() + 1;
    if (z !== it.z) setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, z } : i)));
    interaction.current = { kind: "move", id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
  };

  const onResizeDown = (e: React.PointerEvent, it: Item) => {
    e.stopPropagation();
    interaction.current = {
      kind: "resize", id: it.id, sx: e.clientX, sy: e.clientY, ow: it.w, oh: it.h, keepRatio: it.type === "image",
    };
  };

  // ---------- título / compartilhamento ----------
  const saveTitle = async () => {
    const t = title.trim() || "Sem título";
    setTitle(t);
    if (supabase && t !== board.title) await supabase.from("boards").update({ title: t }).eq("id", board.id);
  };

  const shareUrl = share.token && typeof window !== "undefined" ? `${window.location.origin}/s/${share.token}` : "";

  const toggleShare = async (enabled: boolean) => {
    if (!supabase) return;
    const token = share.token || randomToken();
    const { error } = await supabase.from("boards").update({ share_token: token, share_enabled: enabled }).eq("id", board.id);
    if (error) return flash("Erro ao atualizar link");
    setShare({ token, enabled });
  };

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    flash("Link copiado");
  };

  const sorted = useMemo(() => items.slice().sort((a, b) => a.z - b.z), [items]);

  return (
    <div className="board-page">
      <header className="board-bar">
        <div className="bar-left">
          {!readOnly && (
            <Link href="/" className="btn ghost" title="Voltar">
              ←
            </Link>
          )}
          <LogoIcon size={30} className="hide-m" />
          {readOnly ? (
            <strong className="board-title">{title}</strong>
          ) : (
            <input
              className="board-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </div>
        <div className="bar-right">
          {!readOnly && (
            <>
              <button className="btn" onClick={() => addNote(viewportCenter())}>+ Nota</button>
              <button className="btn" onClick={() => fileInputRef.current?.click()}>+ Imagem</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const dt = new DataTransfer();
                  Array.from(e.target.files || []).forEach((f) => dt.items.add(f));
                  runTransfer(dt, viewportCenter());
                  e.target.value = "";
                }}
              />
              <div className="share-wrap">
                <button className="btn primary" onClick={() => setShareOpen((o) => !o)}>Compartilhar</button>
                {shareOpen && (
                  <div className="share-pop">
                    <p>Link público somente leitura, para clientes e parceiros sem login.</p>
                    {share.enabled ? (
                      <>
                        <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                        <div className="row">
                          <button className="btn primary" onClick={copyShare}>Copiar link</button>
                          <button className="btn ghost" onClick={() => toggleShare(false)}>Desativar</button>
                        </div>
                      </>
                    ) : (
                      <button className="btn primary" onClick={() => toggleShare(true)}>Ativar link público</button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <div
        ref={containerRef}
        className={`canvas-wrap ${dragOver ? "drag-over" : ""}`}
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        }}
        onPointerDown={onBackgroundDown}
        onDoubleClick={(e) => {
          if (readOnly || e.target !== e.currentTarget) return;
          addNote(toCanvas(e.clientX, e.clientY));
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setDragOver(false);
          runTransfer(e.dataTransfer, toCanvas(e.clientX, e.clientY));
        }}
      >
        <div
          className="canvas"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {sorted.map((it) => (
            <div
              key={it.id}
              className={`item item-${it.type} ${selected === it.id ? "selected" : ""}`}
              style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z }}
              onPointerDown={(e) => onItemDown(e, it)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (it.type === "link") window.open(it.content.url, "_blank", "noopener");
                if (it.type === "image" && it.content.source) window.open(it.content.source, "_blank", "noopener");
              }}
            >
              {it.type === "image" && <img src={it.content.src} alt="" draggable={false} />}

              {it.type === "note" && (
                <NoteBody
                  item={it}
                  readOnly={readOnly}
                  onChange={(content) => patchItem(it.id, { content })}
                />
              )}

              {it.type === "link" && (
                <div className="link-card">
                  {it.content.image && <img src={it.content.image} alt="" draggable={false} />}
                  <div className="link-meta">
                    <strong>{it.content.title || hostname(it.content.url)}</strong>
                    <small>{hostname(it.content.url)} ↗</small>
                  </div>
                </div>
              )}

              {!readOnly && selected === it.id && (
                <>
                  <div className="handle" onPointerDown={(e) => onResizeDown(e, it)} />
                  <button
                    className="del"
                    title="Apagar"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => deleteItem(it.id)}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {!items.length && !readOnly && (
          <div className="empty-hint">
            <strong>Arraste imagens para cá</strong>
            <span>do Google, Pinterest, Instagram, do seu computador… ou cole com Ctrl/Cmd+V.</span>
            <span>Duplo clique cria uma nota.</span>
          </div>
        )}
      </div>

      <div className="zoom">
        <button onClick={() => zoomBy(1 / 1.2)}>−</button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button onClick={() => zoomBy(1.2)}>+</button>
        <button onClick={fitView} title="Enquadrar tudo">⤢</button>
      </div>

      {(busy > 0 || toast) && <div className="toast">{busy > 0 ? "Importando…" : toast}</div>}
    </div>
  );
}

function NoteBody({
  item,
  readOnly,
  onChange,
}: {
  item: Item;
  readOnly: boolean;
  onChange: (content: Item["content"]) => void;
}) {
  const [text, setText] = useState<string>(item.content.text || "");
  const color: string = item.content.color || NOTE_COLORS[0];
  const dark = color === "#2a2a2a";

  useEffect(() => {
    if (document.activeElement?.getAttribute("data-note") !== item.id) setText(item.content.text || "");
  }, [item.content.text, item.id]);

  return (
    <div className="note" style={{ background: color, color: dark ? "#eee" : "#1b1b1b" }}>
      <div className="note-grip">
        {!readOnly &&
          NOTE_COLORS.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange({ ...item.content, color: c })}
            />
          ))}
      </div>
      <textarea
        data-note={item.id}
        value={text}
        readOnly={readOnly}
        placeholder="Escreva…"
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== item.content.text && onChange({ ...item.content, text })}
      />
    </div>
  );
}

// ---------- utilidades ----------
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function firstUrl(s: string | undefined | null) {
  if (!s) return null;
  const line = s.split(/\r?\n/).find((l) => l && !l.startsWith("#"))?.trim();
  return line && /^https?:\/\//i.test(line) ? line : null;
}

function looksLikeImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url);
}

/** Links do Google Imagens (imgres?imgurl=...) apontam para a imagem original em alta. */
function googleImgUrl(url: string) {
  try {
    const u = new URL(url);
    if (!/(^|\.)google\./.test(u.hostname)) return null;
    return u.searchParams.get("imgurl") || u.searchParams.get("mediaurl") || null;
  } catch {
    return null;
  }
}

function bestFromSrcset(srcset: string | null) {
  if (!srcset) return null;
  const parts = srcset
    .split(",")
    .map((p) => p.trim().split(/\s+/))
    .map(([url, d]) => ({ url, n: parseFloat(d || "1") || 1 }));
  parts.sort((a, b) => b.n - a.n);
  return parts[0]?.url || null;
}

function absolutize(src: string, base: string | null) {
  if (src.startsWith("data:") || /^https?:\/\//i.test(src)) return src;
  if (src.startsWith("//")) return "https:" + src;
  try {
    return new URL(src, base || undefined).toString();
  } catch {
    return src;
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function randomToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
