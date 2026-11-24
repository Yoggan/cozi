export type ContactKind = "user" | "business";

export type ContactSource = "saved" | "recent";

export type Contact = {
  contactId: string | null;
  kind: ContactKind;
  source: ContactSource;
  displayName: string;
  handle: string;
  nickname: string | null;
  canReceive: boolean;
  canSend: boolean;
  canRequest: boolean;
  lastUsedAt: number | null;
  sortAt: number;
};
