import { readJson, writeJson } from './storage';

/**
 * Local-only history of AI assistant conversations — both typed chats and
 * transcribed voice calls. Nothing here ever leaves the device; it's a
 * convenience log the patient can look back on.
 */

const KEY = 'agapai/conversations-v1';
const MAX_CONVERSATIONS = 100;

export interface StoredMessage {
  who: 'user' | 'ai';
  text: string;
  /** Present for text-chat replies (e.g. "gemini", "on-device"). */
  source?: string;
}

export interface StoredConversation {
  id: string;
  mode: 'text' | 'voice';
  startedAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export async function listConversations(): Promise<StoredConversation[]> {
  const all = await readJson<StoredConversation[]>(KEY, []);
  return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Insert or update a conversation by id, newest kept, oldest trimmed. */
export async function saveConversation(conv: StoredConversation): Promise<void> {
  if (conv.messages.length === 0) return;
  const all = await readJson<StoredConversation[]>(KEY, []);
  const idx = all.findIndex((c) => c.id === conv.id);
  if (idx === -1) all.push(conv);
  else all[idx] = conv;
  const trimmed = all
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  await writeJson(KEY, trimmed);
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await readJson<StoredConversation[]>(KEY, []);
  await writeJson(
    KEY,
    all.filter((c) => c.id !== id),
  );
}

export async function clearConversations(): Promise<void> {
  await writeJson(KEY, []);
}

/** First user line (or first line) — used as a list preview. */
export function conversationPreview(conv: StoredConversation): string {
  const firstUser = conv.messages.find((m) => m.who === 'user');
  return (firstUser ?? conv.messages[0])?.text ?? '(empty)';
}
