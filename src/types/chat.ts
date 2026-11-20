export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_color: string;
  is_online: boolean;
  status_message: string;
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
  other_user: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
}
