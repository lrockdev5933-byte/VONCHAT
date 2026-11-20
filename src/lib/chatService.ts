import type { RealtimeChannel } from '@supabase/supabase-js';
import type { User } from './firebase';
import { supabase } from './supabase';
import type { ConversationListItem, Message, Profile } from '../types/chat';

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
    is_online?: boolean;
  }
): Promise<Profile> {
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

  if (updates.is_online !== undefined) {
    payload.is_online = updates.is_online;
    payload.last_seen_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('id', uid)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function setPresenceStatus(uid: string, isOnline: boolean): Promise<void> {
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

export async function findOrCreateConversation(targetUserId: string): Promise<string> {
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

export async function fetchConversations(currentUid: string): Promise<ConversationListItem[]> {
  const client = requireSupabase();

  const { data, error } = await client
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
    .order('last_message_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as ConversationQueryRow[];
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
      other_user: rawProfile,
    });
  }

  return items;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Message[];
}

export async function sendTextMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<Message> {
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
  onNewMessage: (message: Message) => void
): () => void {
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
  onProfileChange: (profile: Profile) => void
): () => void {
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
