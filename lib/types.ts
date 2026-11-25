export type ItemType = "image" | "note" | "link";

export type ImageContent = { src: string; source?: string; caption?: string };
export type NoteContent = { text: string; color?: string };
export type LinkContent = { url: string; title?: string; image?: string };

export type Item = {
  id: string;
  board_id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  content: Record<string, any>;
};

export type Board = {
  id: string;
  title: string;
  share_token: string | null;
  share_enabled: boolean;
  updated_at?: string;
};
