import type { RealtimeChannel } from '@supabase/supabase-js';
import { isFirebaseConfigured, type User } from './firebase';
import { isSupabaseConfigured, supabase } from './supabase';
import * as firestoreService from './firestoreChatService';
import type {
  ConversationListItem,
  Message,
  MessageReaction,
  MessageSearchResult,
  Profile,
  StatusItem,
  StatusMediaType,
  StatusViewRecord,
} from '../types/chat';

export const isBackendConfigured = isSupabaseConfigured || isFirebaseConfigured;
export const activeBackend: 'supabase' | 'firebase' | 'none' = isSupabaseConfigured
  ? 'supabase'
  : isFirebaseConfigured
    ? 'firebase'
    : 'none';

const CALM_AVATAR_COLORS = [
  '#166534',
  '#15803D',
  '#0F766E',
  '#047857',
  '#3F6212',
  '#1E6B4B',
];

function pickAvatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return CALM_AVATAR_COLORS[hash % CALM_AVATAR_COLORS.length];
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }
  return supabase;
}

export function formatSupabaseError(error: unknown): string {
  if (activeBackend === 'firebase') {
    return firestoreService.formatFirestoreErrorForUser(error);
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('JWT') || message.includes('row-level security')) {
      return 'Authorization with Supabase failed. Ensure Firebase project "lrockchat" is enabled under Supabase Third-Party Auth and RLS policies from supabase/schema.sql are applied.';
    }
    return message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected database error occurred.';
}

export async function upsertUserProfile(user: User, preferredName?: string): Promise<Profile> {
  if (activeBackend === 'firebase') {
    return firestoreService.upsertUserProfile(user, preferredName);
  }

  const client = requireSupabase();
  const normalizedEmail = (user.email ?? '').trim().toLowerCase();
  const fallbackName = normalizedEmail.split('@')[0] || 'vonChat member';
  const nowIso = new Date().toISOString();

  const { data: existing, error: fetchError } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.uid)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existing) {
    const updates: Partial<Profile> = {
      email: normalizedEmail,
      is_online: true,
      last_seen_at: nowIso,
      updated_at: nowIso,
    };
    if (preferredName?.trim()) {
      updates.display_name = preferredName.trim();
    }

    const { data, error } = await client
      .from('profiles')
      .update(updates)
      .eq('id', user.uid)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as Profile;
  }

  const displayName = (preferredName ?? user.displayName ?? fallbackName).trim() || fallbackName;
  const { data, error } = await client
    .from('profiles')
    .insert({
      id: user.uid,
      email: normalizedEmail,
      display_name: displayName,
      avatar_color: pickAvatarColor(user.uid),
      is_online: true,
      status_message: '',
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function updateUserProfile(
  uid: string,
  updates: {
    display_name?: string;
    status_message?: string;
    bio?: string;
    is_online?: boolean;
    chat_wallpaper?: string;
  }
): Promise<Profile> {
  if (activeBackend === 'firebase') {
    return firestoreService.updateUserProfile(uid, updates);
  }

  const client = requireSupabase();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.display_name !== undefined) {
    const trimmedName = updates.display_name.trim();
    if (!trimmedName) {
      throw new Error('Display name cannot be empty.');
    }
    payload.display_name = trimmedName;
  }

  if (updates.status_message !== undefined) {
    payload.status_message = updates.status_message.trim().slice(0, 120);
  }

  if (updates.bio !== undefined) {
    payload.bio = updates.bio.trim().slice(0, 240);
  }

  if (updates.is_online !== undefined) {
    payload.is_online = updates.is_online;
    payload.last_seen_at = new Date().toISOString();
  }

  if (updates.chat_wallpaper !== undefined) {
    payload.chat_wallpaper = updates.chat_wallpaper;
  }

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('id', uid)
    .select()
    .single();

  if (error) {
    const message = String(error.message ?? '');
    const missingOptionalColumn =
      error.code === 'PGRST204' ||
      message.includes('chat_wallpaper') ||
      message.includes('bio');
    if (missingOptionalColumn) {
      const fallbackPayload = { ...payload };
      if (updates.chat_wallpaper !== undefined && message.includes('chat_wallpaper')) {
        delete fallbackPayload.chat_wallpaper;
      }
      if (updates.bio !== undefined && message.includes('bio')) {
        delete fallbackPayload.bio;
      }
      if (error.code === 'PGRST204' && Object.keys(fallbackPayload).length === Object.keys(payload).length) {
        delete fallbackPayload.chat_wallpaper;
        delete fallbackPayload.bio;
      }
      const retry = await client
        .from('profiles')
        .update(fallbackPayload)
        .eq('id', uid)
        .select()
        .single();
      if (retry.error) {
        throw retry.error;
      }
      return {
        ...(retry.data as Profile),
        ...(updates.chat_wallpaper !== undefined ? { chat_wallpaper: updates.chat_wallpaper } : {}),
        ...(updates.bio !== undefined ? { bio: updates.bio.trim().slice(0, 240) } : {}),
      };
    }
    throw error;
  }

  return data as Profile;
}

export async function setPresenceStatus(uid: string, isOnline: boolean): Promise<void> {
  if (activeBackend === 'firebase') {
    return firestoreService.setPresenceStatus(uid, isOnline);
  }
  if (!supabase) return;
  try {
    await supabase
      .from('profiles')
      .update({
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);
  } catch {
    // Presence updates on unload/sign-out are best-effort
  }
}

export async function findUsersByEmail(query: string, currentUid: string): Promise<Profile[]> {
  if (activeBackend === 'firebase') {
    return firestoreService.findUsersByEmail(query, currentUid);
  }

  const client = requireSupabase();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .ilike('email', `%${trimmed}%`)
    .neq('id', currentUid)
    .order('email', { ascending: true })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []) as Profile[];
}

export async function findOrCreateConversation(
  targetUserId: string,
  currentUid?: string,
  targetProfile?: Profile
): Promise<string> {
  if (activeBackend === 'firebase') {
    if (!currentUid) {
      throw new Error('Current user ID is required.');
    }
    return firestoreService.findOrCreateConversation(targetUserId, currentUid, targetProfile);
  }

  const client = requireSupabase();
  const { data, error } = await client.rpc('find_or_create_conversation', {
    target_user_id: targetUserId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

interface ParticipantJoinRow {
  conversation_id: string;
  user_id: string;
  profiles: Profile | Profile[] | null;
}

interface ConversationQueryRow {
  id: string;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  conversation_participants: ParticipantJoinRow[];
}

interface UnreadCountRow {
  conversation_id: string;
  unread_count: number | string;
}

export async function fetchConversations(currentUid: string): Promise<ConversationListItem[]> {
  if (activeBackend === 'firebase') {
    return firestoreService.fetchConversations(currentUid);
  }

  const client = requireSupabase();

  const [conversationsRes, unreadRes, archivedRes] = await Promise.all([
    client
      .from('conversations')
      .select(
        `
        id,
        last_message_preview,
        last_message_at,
        created_at,
        conversation_participants (
          conversation_id,
          user_id,
          profiles (
            id,
            email,
            display_name,
            avatar_color,
            is_online,
            status_message,
            last_seen_at,
            created_at,
            updated_at
          )
        )
      `
      )
      .order('last_message_at', { ascending: false }),
    client.rpc('get_unread_counts'),
    client
      .from('conversation_participants')
      .select('conversation_id, archived')
      .eq('user_id', currentUid),
  ]);

  if (conversationsRes.error) {
    throw conversationsRes.error;
  }

  const unreadByConversation = new Map<string, number>();
  if (!unreadRes.error && Array.isArray(unreadRes.data)) {
    for (const row of unreadRes.data as UnreadCountRow[]) {
      unreadByConversation.set(row.conversation_id, Number(row.unread_count) || 0);
    }
  }

  const archivedByConversation = new Map<string, boolean>();
  if (!archivedRes.error && Array.isArray(archivedRes.data)) {
    for (const row of archivedRes.data as Array<{
      conversation_id: string;
      archived?: boolean;
    }>) {
      archivedByConversation.set(row.conversation_id, Boolean(row.archived));
    }
  }

  const rows = (conversationsRes.data ?? []) as unknown as ConversationQueryRow[];
  const items: ConversationListItem[] = [];

  for (const row of rows) {
    const participants = row.conversation_participants ?? [];
    const isMember = participants.some((p) => p.user_id === currentUid);
    if (!isMember) {
      continue;
    }

    const otherParticipant =
      participants.find((p) => p.user_id !== currentUid) ?? participants[0];
    if (!otherParticipant) {
      continue;
    }

    const rawProfile = Array.isArray(otherParticipant.profiles)
      ? otherParticipant.profiles[0]
      : otherParticipant.profiles;

    if (!rawProfile) {
      continue;
    }

    items.push({
      id: row.id,
      last_message_preview: row.last_message_preview,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      unread_count: unreadByConversation.get(row.id) ?? 0,
      archived: archivedByConversation.get(row.id) ?? false,
      other_user: rawProfile,
    });
  }

  return items;
}

export async function setConversationArchived(
  conversationId: string,
  currentUid: string,
  archived: boolean
): Promise<void> {
  if (activeBackend === 'firebase') {
    return firestoreService.setConversationArchived(conversationId, currentUid, archived);
  }
  const client = requireSupabase();
  const { error } = await client
    .from('conversation_participants')
    .update({ archived: Boolean(archived) })
    .eq('conversation_id', conversationId)
    .eq('user_id', currentUid);

  if (error) {
    throw error;
  }
}

export async function markConversationRead(
  conversationId: string,
  currentUid?: string,
  minReadAtIso?: string
): Promise<void> {
  if (activeBackend === 'firebase') {
    if (!currentUid) return;
    return firestoreService.markConversationRead(conversationId, currentUid, minReadAtIso);
  }
  if (!supabase) return;
  const { error } = await supabase.rpc('mark_conversation_read', {
    target_conversation_id: conversationId,
  });
  if (error) {
    throw error;
  }
}

export async function fetchMessages(
  conversationId: string,
  currentUid?: string
): Promise<Message[]> {
  if (activeBackend === 'firebase') {
    if (!currentUid) return [];
    return firestoreService.fetchMessages(conversationId, currentUid);
  }

  const client = requireSupabase();
  const [messagesRes, reactionsRes] = await Promise.all([
    client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    client
      .from('message_reactions')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
  ]);

  if (messagesRes.error) {
    throw messagesRes.error;
  }

  const reactionsByMessage = new Map<string, MessageReaction[]>();
  if (!reactionsRes.error && Array.isArray(reactionsRes.data)) {
    for (const reaction of reactionsRes.data as MessageReaction[]) {
      const existing = reactionsByMessage.get(reaction.message_id) ?? [];
      existing.push(reaction);
      reactionsByMessage.set(reaction.message_id, existing);
    }
  }

  return ((messagesRes.data ?? []) as Message[]).map((msg) => ({
    ...msg,
    reactions: reactionsByMessage.get(msg.id) ?? [],
  }));
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function searchMessagesAcrossConversations(
  currentUid: string,
  queryStr: string,
  knownConversations?: ConversationListItem[]
): Promise<MessageSearchResult[]> {
  if (activeBackend === 'firebase') {
    return firestoreService.searchMessagesAcrossConversations(
      currentUid,
      queryStr,
      knownConversations
    );
  }

  const normalized = queryStr.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const client = requireSupabase();
  const conversations =
    knownConversations && knownConversations.length > 0
      ? knownConversations
      : await fetchConversations(currentUid);

  const convById = new Map(conversations.map((c) => [c.id, c]));
  const longestToken = tokens.reduce(
    (best, token) => (token.length > best.length ? token : best),
    tokens[0]
  );

  const { data, error } = await client
    .from('messages')
    .select('*')
    .ilike('content', `%${escapeIlikePattern(longestToken)}%`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const matched: { result: MessageSearchResult; exactPhrase: boolean }[] = [];
  for (const msg of (data ?? []) as Message[]) {
    const conv = convById.get(msg.conversation_id);
    if (!conv) continue;
    const lower = msg.content.toLowerCase();
    const exactPhrase = lower.includes(normalized);
    const matchesAllTokens = exactPhrase || tokens.every((t) => lower.includes(t));
    if (!matchesAllTokens) continue;

    matched.push({
      result: {
        message: msg,
        conversation_id: msg.conversation_id,
        other_user: conv.other_user,
      },
      exactPhrase,
    });
  }

  matched.sort((a, b) => {
    if (a.exactPhrase !== b.exactPhrase) {
      return a.exactPhrase ? -1 : 1;
    }
    return b.result.message.created_at.localeCompare(a.result.message.created_at);
  });

  return matched.slice(0, 50).map((entry) => entry.result);
}

export async function addMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string
): Promise<MessageReaction> {
  if (activeBackend === 'firebase') {
    return firestoreService.addMessageReaction(messageId, conversationId, userId, emoji);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('message_reactions')
    .insert({
      message_id: messageId,
      conversation_id: conversationId,
      user_id: userId,
      emoji,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as MessageReaction;
}

export async function removeMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string
): Promise<void> {
  if (activeBackend === 'firebase') {
    return firestoreService.removeMessageReaction(messageId, conversationId, userId, emoji);
  }

  const client = requireSupabase();
  const { error } = await client
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  if (error) {
    throw error;
  }
}

export function subscribeToConversationReactions(
  conversationId: string,
  currentUid: string,
  onInsert: (reaction: MessageReaction) => void,
  onDelete: (reaction: Partial<MessageReaction> & { id?: string }) => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToConversationReactions(
      conversationId,
      currentUid,
      onInsert,
      onDelete
    );
  }

  if (!supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel(`reactions:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (payload.new) {
          onInsert(payload.new as MessageReaction);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (payload.old) {
          onDelete(payload.old as Partial<MessageReaction> & { id?: string });
        }
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export async function sendTextMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<Message> {
  if (activeBackend === 'firebase') {
    return firestoreService.sendTextMessage(conversationId, senderId, content);
  }

  const client = requireSupabase();
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: trimmed,
      message_type: 'text',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Message;
}

export async function sendStickerMessage(
  conversationId: string,
  senderId: string,
  stickerId: string,
  label: string
): Promise<Message> {
  if (activeBackend === 'firebase') {
    return firestoreService.sendStickerMessage(conversationId, senderId, stickerId, label);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: `Sticker: ${label}`,
      message_type: 'sticker',
      sticker_id: stickerId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Message;
}

export function subscribeToConversationMessages(
  conversationId: string,
  currentUid: string,
  onNewMessage: (message: Message) => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToConversationMessages(
      conversationId,
      currentUid,
      onNewMessage
    );
  }

  if (!supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (payload.new) {
          onNewMessage(payload.new as Message);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export function subscribeToConversationUpdates(
  currentUid: string,
  onRefreshNeeded: () => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToConversationUpdates(currentUid, onRefreshNeeded);
  }

  if (!supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel(`inbox:${currentUid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
      },
      () => {
        onRefreshNeeded();
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_participants',
        filter: `user_id=eq.${currentUid}`,
      },
      () => {
        onRefreshNeeded();
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export function subscribeToProfileUpdates(
  watchedUserIds: string[],
  onProfileChange: (profile: Profile) => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToProfileUpdates(watchedUserIds, onProfileChange);
  }

  if (!supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel('profiles:presence')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        if (payload.new) {
          onProfileChange(payload.new as Profile);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export interface TypingChannelController {
  sendTyping: (isTyping: boolean) => void;
  unsubscribe: () => void;
}

export function subscribeToTypingIndicator(
  conversationId: string,
  currentUid: string,
  otherUid: string,
  onTypingChange: (isTyping: boolean) => void
): TypingChannelController {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToTypingIndicator(
      conversationId,
      currentUid,
      otherUid,
      onTypingChange
    );
  }

  if (!supabase) {
    return {
      sendTyping: () => {},
      unsubscribe: () => {},
    };
  }

  let isSubscribed = false;
  let expiryTimer: number | null = null;

  const channel: RealtimeChannel = supabase
    .channel(`typing:${conversationId}`, {
      config: {
        broadcast: {
          self: false,
        },
      },
    })
    .on('broadcast', { event: 'typing' }, (message) => {
      const payload = message.payload as
        | { userId?: string; isTyping?: boolean }
        | undefined;
      if (!payload || !payload.userId || payload.userId === currentUid) {
        return;
      }

      if (expiryTimer !== null) {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
      }

      if (payload.isTyping) {
        onTypingChange(true);
        expiryTimer = window.setTimeout(() => {
          expiryTimer = null;
          onTypingChange(false);
        }, 3500);
      } else {
        onTypingChange(false);
      }
    })
    .subscribe((status) => {
      isSubscribed = status === 'SUBSCRIBED';
    });

  return {
    sendTyping: (isTyping: boolean) => {
      if (!isSubscribed) return;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: currentUid,
          isTyping,
        },
      });
    },
    unsubscribe: () => {
      if (expiryTimer !== null) {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      if (isSubscribed) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: currentUid,
            isTyping: false,
          },
        });
      }
      isSubscribed = false;
      void supabase?.removeChannel(channel);
    },
  };
}

export function subscribeToReadReceipt(
  conversationId: string,
  otherUid: string,
  onReadAtChange: (lastReadAt: string | null) => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToReadReceipt(conversationId, otherUid, onReadAtChange);
  }

  if (!supabase) {
    onReadAtChange(null);
    return () => {};
  }

  let active = true;

  void supabase
    .from('conversation_participants')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', otherUid)
    .maybeSingle()
    .then(({ data, error }) => {
      if (!active || error) return;
      const lastReadAt =
        data && typeof (data as { last_read_at?: unknown }).last_read_at === 'string'
          ? String((data as { last_read_at: string }).last_read_at)
          : null;
      onReadAtChange(lastReadAt);
    });

  const channel: RealtimeChannel = supabase
    .channel(`read_receipt:${conversationId}:${otherUid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_participants',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as { user_id?: string; last_read_at?: string } | undefined;
        if (!row || row.user_id !== otherUid) return;
        onReadAtChange(typeof row.last_read_at === 'string' ? row.last_read_at : null);
      }
    )
    .subscribe();

  return () => {
    active = false;
    void supabase?.removeChannel(channel);
  };
}

export async function createStatus(input: {
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  mediaType: StatusMediaType;
  caption?: string;
  mediaUrl?: string;
  stickerId?: string;
  backgroundTheme?: string;
  visibleToUids: string[];
}): Promise<StatusItem> {
  if (activeBackend === 'firebase') {
    return firestoreService.createStatus(input);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('statuses')
    .insert({
      author_id: input.authorId,
      media_type: input.mediaType,
      caption: (input.caption ?? '').trim().slice(0, 300),
      media_url: input.mediaUrl ?? '',
      sticker_id: input.stickerId ?? '',
      background_theme: input.backgroundTheme ?? 'forest',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const row = data as {
    id: string;
    author_id: string;
    media_type: StatusMediaType;
    caption: string;
    media_url: string;
    sticker_id: string;
    background_theme: string;
    created_at: string;
    expires_at: string;
  };

  return {
    id: row.id,
    author_id: row.author_id,
    author_name: input.authorName,
    author_avatar_color: input.authorAvatarColor,
    media_type: row.media_type,
    caption: row.caption,
    media_url: row.media_url,
    sticker_id: row.sticker_id,
    background_theme: row.background_theme,
    visible_to: [input.authorId, ...input.visibleToUids],
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

export async function fetchStatuses(currentUid: string): Promise<StatusItem[]> {
  if (activeBackend === 'firebase') {
    return firestoreService.fetchStatuses(currentUid);
  }
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('statuses')
    .select(
      `
      id,
      author_id,
      media_type,
      caption,
      media_url,
      sticker_id,
      background_theme,
      created_at,
      expires_at,
      profiles ( display_name, avatar_color )
    `
    )
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    const rawProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: String(row.id),
      author_id: String(row.author_id),
      author_name: rawProfile?.display_name ?? 'vonChat member',
      author_avatar_color: rawProfile?.avatar_color ?? '#166534',
      media_type: (row.media_type as StatusMediaType) ?? 'text',
      caption: String(row.caption ?? ''),
      media_url: String(row.media_url ?? ''),
      sticker_id: String(row.sticker_id ?? ''),
      background_theme: String(row.background_theme ?? 'forest'),
      visible_to: [currentUid],
      created_at: String(row.created_at),
      expires_at: String(row.expires_at),
    };
  });
}

export function subscribeToStatuses(
  currentUid: string,
  onStatusesChange: (statuses: StatusItem[]) => void
): () => void {
  if (activeBackend === 'firebase') {
    return firestoreService.subscribeToStatuses(currentUid, onStatusesChange);
  }

  if (!supabase) {
    onStatusesChange([]);
    return () => {};
  }

  let active = true;
  const refresh = () => {
    void fetchStatuses(currentUid).then((items) => {
      if (active) onStatusesChange(items);
    });
  };
  refresh();

  const channel: RealtimeChannel = supabase
    .channel(`statuses:${currentUid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'statuses' },
      refresh
    )
    .subscribe();

  return () => {
    active = false;
    void supabase?.removeChannel(channel);
  };
}

export async function deleteStatus(statusId: string): Promise<void> {
  if (activeBackend === 'firebase') {
    return firestoreService.deleteStatus(statusId);
  }
  const client = requireSupabase();
  const { error } = await client.from('statuses').delete().eq('id', statusId);
  if (error) throw error;
}

export async function markStatusViewed(
  statusId: string,
  authorId: string,
  viewer: { uid: string; displayName: string; avatarColor: string }
): Promise<void> {
  if (activeBackend === 'firebase') {
    return firestoreService.markStatusViewed(statusId, authorId, viewer);
  }
  if (!supabase || !viewer.uid || viewer.uid === authorId) return;
  await supabase
    .from('status_views')
    .upsert({ status_id: statusId, viewer_id: viewer.uid }, { onConflict: 'status_id,viewer_id' });
}

export async function fetchStatusViews(
  statusId: string,
  authorUid: string
): Promise<StatusViewRecord[]> {
  if (activeBackend === 'firebase') {
    return firestoreService.fetchStatusViews(statusId, authorUid);
  }
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('status_views')
    .select('status_id, viewer_id, viewed_at, profiles ( display_name, avatar_color )')
    .eq('status_id', statusId)
    .order('viewed_at', { ascending: false });

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => {
    const rawProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      status_id: String(row.status_id),
      viewer_id: String(row.viewer_id),
      viewer_name: rawProfile?.display_name ?? 'vonChat member',
      viewer_avatar_color: rawProfile?.avatar_color ?? '#166534',
      viewed_at: String(row.viewed_at),
    };
  });
}

