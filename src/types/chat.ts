export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_color: string;
  is_online: boolean;
  status_message: string;
  bio?: string;
  chat_wallpaper?: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  created_by: string;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ConversationListItem {
  id: string;
  last_message_preview: string | null;
  last_message_at: string;
  created_at: string;
  unread_count: number;
  archived: boolean;
  other_user: Profile;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: 'text' | 'sticker';
  sticker_id?: string | null;
  created_at: string;
  reactions?: MessageReaction[];
  pending?: boolean;
  failed?: boolean;
}

export interface MessageSearchResult {
  message: Message;
  conversation_id: string;
  other_user: Profile;
}

export type StatusMediaType = 'text' | 'image' | 'video' | 'sticker';

export interface StatusItem {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_color: string;
  media_type: StatusMediaType;
  caption: string;
  media_url: string;
  sticker_id: string;
  background_theme: string;
  visible_to: string[];
  created_at: string;
  expires_at: string;
}

export interface StatusViewRecord {
  status_id: string;
  viewer_id: string;
  viewer_name: string;
  viewer_avatar_color: string;
  viewed_at: string;
}

