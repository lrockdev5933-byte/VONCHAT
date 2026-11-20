import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Search,
  Send,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, signOut, type User } from '../lib/firebase';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchConversations,
  fetchMessages,
  formatSupabaseError,
  sendTextMessage,
  setPresenceStatus,
  subscribeToConversationMessages,
  subscribeToConversationUpdates,
  subscribeToProfileUpdates,
} from '../lib/chatService';
import type { ConversationListItem, Message, Profile } from '../types/chat';
import { VonChatLogo } from './VonChatLogo';
import { NewChatModal } from './NewChatModal';
import { ProfileModal } from './ProfileModal';

interface ChatWorkspaceProps {
  user: User;
  profile: Profile | null;
  profileSyncError: string | null;
  onProfileUpdated: (updated: Profile) => void;
}

function UserStatusInline({
  isOnline,
  statusMessage,
  showMessage = true,
}: {
  isOnline: boolean;
  statusMessage?: string;
  showMessage?: boolean;
}) {
  const trimmedStatus = showMessage ? statusMessage?.trim() ?? '' : '';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs min-w-0">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isOnline ? 'bg-[#16A34A]' : 'bg-[#9DB3A5]'
        }`}
        aria-hidden="true"
      />
      <span
        className={`shrink-0 ${
          isOnline ? 'text-[#15803D] font-medium' : 'text-[#63806F]'
        }`}
      >
        {isOnline ? 'Online' : 'Offline'}
      </span>
      {trimmedStatus && (
        <>
          <span aria-hidden="true" className="text-[#8CA896] shrink-0">
            ·
          </span>
          <span className="text-[#4B6856] truncate">{trimmedStatus}</span>
        </>
      )}
    </span>
  );
}

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatListTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ChatWorkspace({
  user,
  profile,
  profileSyncError,
  onProfileUpdated,
}: ChatWorkspaceProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(isSupabaseConfigured);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const loadConversations = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingConversations(false);
      return;
    }
    try {
      setConversationsError(null);
      const items = await fetchConversations(user.uid);
      setConversations(items);
    } catch (err) {
      setConversationsError(formatSupabaseError(err));
    } finally {
      setLoadingConversations(false);
    }
  }, [user.uid]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const unsubscribe = subscribeToConversationUpdates(user.uid, () => {
      void loadConversations();
    });
    return unsubscribe;
  }, [user.uid, loadConversations]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const unsubscribe = subscribeToProfileUpdates((updatedProfile) => {
      if (updatedProfile.id === user.uid) {
        onProfileUpdated(updatedProfile);
      }
      setConversations((prev) =>
        prev.map((conv) =>
          conv.other_user.id === updatedProfile.id
            ? { ...conv, other_user: updatedProfile }
            : conv
        )
      );
    });
    return unsubscribe;
  }, [user.uid, onProfileUpdated]);

  useEffect(() => {
    if (!activeConversationId || !isSupabaseConfigured) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setMessagesError(null);

    fetchMessages(activeConversationId)
      .then((rows) => {
        if (!cancelled) {
          setMessages(rows);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMessagesError(formatSupabaseError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });

    const unsubscribe = subscribeToConversationMessages(activeConversationId, (incoming) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) {
          return prev;
        }
        return [...prev, incoming];
      });
      void loadConversations();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeConversationId, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConversationId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const filteredConversations = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const name = conv.other_user.display_name.toLowerCase();
      const email = conv.other_user.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [conversations, searchFilter]);

  const sendMessageContent = async (textToSend: string, retryTempId?: string) => {
    if (!activeConversationId || !isSupabaseConfigured) return;
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    const tempId = retryTempId ?? `temp-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.uid,
      content: trimmed,
      created_at: new Date().toISOString(),
      pending: true,
      failed: false,
    };

    if (retryTempId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === retryTempId ? optimisticMessage : m))
      );
    } else {
      setMessages((prev) => [...prev, optimisticMessage]);
      setDraft('');
      if (composerRef.current) {
        composerRef.current.style.height = 'auto';
      }
    }

    setSending(true);
    try {
      const saved = await sendTextMessage(activeConversationId, user.uid, trimmed);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === saved.id)) {
          return withoutTemp;
        }
        return [...withoutTemp, saved];
      });
      void loadConversations();
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleSendSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    await sendMessageContent(draft);
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !sending) {
        void sendMessageContent(draft);
      }
    }
  };

  const handleComposerChange = (value: string) => {
    setDraft(value);
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
      composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 140)}px`;
    }
  };

  const handleConversationOpened = async (conversationId: string) => {
    await loadConversations();
    setActiveConversationId(conversationId);
  };

  const handleSignOut = async () => {
    await setPresenceStatus(user.uid, false);
    await signOut(auth);
  };

  const myDisplayName =
    profile?.display_name || user.displayName || user.email?.split('@')[0] || 'You';
  const myInitials = myDisplayName.slice(0, 2).toUpperCase();
  const myOnline = profile?.is_online ?? true;
  const myStatusMessage = profile?.status_message ?? '';

  return (
    <div className="h-screen w-full bg-[#F4F8F5] text-[#112419] flex overflow-hidden">
      {/* Left calm sage sidebar */}
      <aside
        className={`${
          activeConversationId ? 'hidden md:flex' : 'flex'
        } w-full md:w-[340px] lg:w-[360px] shrink-0 flex-col bg-[#ECF3EE] border-r border-[#D5E3D9]`}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-4 border-b border-[#D5E3D9] flex items-center justify-between gap-2 shrink-0">
          <VonChatLogo size="sm" tone="light" />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label="Profile and status settings"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#375242] hover:bg-[#DFECE3] hover:text-[#0F291A] transition-colors"
            >
              <UserIcon className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              disabled={!isSupabaseConfigured}
              onClick={() => setNewChatOpen(true)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>New chat</span>
            </button>
          </div>
        </div>

        {/* Conversation Search */}
        <div className="p-3 border-b border-[#DCE8E0] shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-[#63806F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by participant name..."
              aria-label="Filter conversations by participant name"
              className="w-full min-h-[40px] pl-9 pr-9 py-2 text-sm bg-white border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                aria-label="Clear conversation filter"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-[#63806F] hover:text-[#0F291A] hover:bg-[#EEF4F0] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!isSupabaseConfigured && (
            <div className="m-2 rounded-xl border border-[#C7DBD0] bg-white p-4 space-y-2 text-xs text-[#375242]">
              <p className="font-semibold text-[#0F291A]">
                Connect Supabase to enable messaging
              </p>
              <p className="leading-relaxed">
                Set <code className="font-mono text-[11px] bg-[#EEF4F0] px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-[11px] bg-[#EEF4F0] px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in your environment, enable Firebase project{' '}
                <code className="font-mono text-[11px] bg-[#EEF4F0] px-1 py-0.5 rounded">lrockchat</code> under Supabase Third-Party Auth, and run{' '}
                <code className="font-mono text-[11px] bg-[#EEF4F0] px-1 py-0.5 rounded">supabase/schema.sql</code>.
              </p>
            </div>
          )}

          {(profileSyncError || conversationsError) && (
            <div
              role="alert"
              className="m-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{profileSyncError || conversationsError}</span>
            </div>
          )}

          {loadingConversations && (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-[#547260]">
              <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
              <span>Loading conversations...</span>
            </div>
          )}

          {!loadingConversations &&
            isSupabaseConfigured &&
            filteredConversations.length === 0 && (
              <div className="px-4 py-12 text-center space-y-3">
                <p className="text-sm font-medium text-[#1F3A2A]">
                  {searchFilter.trim()
                    ? 'No matching conversations'
                    : 'No conversations yet'}
                </p>
                <p className="text-xs text-[#547260]">
                  {searchFilter.trim()
                    ? `No participant matches "${searchFilter.trim()}".`
                    : 'Find someone by their email address to start your first chat.'}
                </p>
                {searchFilter.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#F3F8F5] text-[#1F3A2A] text-xs font-semibold transition-colors"
                  >
                    Clear filter
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold transition-colors"
                  >
                    Find user by email
                  </button>
                )}
              </div>
            )}

          {!loadingConversations &&
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const initials = conv.other_user.display_name.slice(0, 2).toUpperCase();
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition-colors border ${
                    isSelected
                      ? 'bg-white border-[#C5DACD] shadow-xs'
                      : 'bg-transparent border-transparent hover:bg-[#E2EDE6]'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                    style={{ backgroundColor: conv.other_user.avatar_color || '#166534' }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-[#0F291A] truncate">
                          {conv.other_user.display_name}
                        </span>
                        <UserStatusInline
                          isOnline={conv.other_user.is_online}
                          statusMessage={conv.other_user.status_message}
                        />
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[#63806F] shrink-0">
                        {formatListTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#547260] truncate">
                      {conv.last_message_preview || conv.other_user.email}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>

        {/* Bottom Signed-In Account Footer */}
        <div className="px-3.5 py-3 border-t border-[#D5E3D9] bg-[#E6EFE9] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2.5 min-w-0 text-left rounded-xl p-1 hover:bg-[#DCE8E0] transition-colors flex-1"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
              style={{ backgroundColor: profile?.avatar_color || '#166534' }}
            >
              {myInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs font-semibold text-[#0F291A] truncate">
                  {myDisplayName}
                </p>
                <UserStatusInline
                  isOnline={myOnline}
                  statusMessage={myStatusMessage}
                />
              </div>
              <p className="text-[11px] text-[#547260] truncate">{user.email}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#4B6856] hover:text-[#0F291A] hover:bg-[#DCE8E0] transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Right active conversation canvas */}
      <main
        className={`${
          activeConversationId ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col bg-[#F7FAF8] min-w-0`}
      >
        {!activeConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-5">
              <div className="flex justify-center">
                <VonChatLogo size="lg" tone="light" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-[#0F291A]">
                  Welcome to your calm space
                </h2>
                <p className="text-sm text-[#547260] leading-relaxed">
                  Select an existing conversation from the sidebar or look up someone by email to start a private chat.
                </p>
              </div>
              <button
                type="button"
                disabled={!isSupabaseConfigured}
                onClick={() => setNewChatOpen(true)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span>Find user by email</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header (strictly text-chat essentials; no call/video/filter/sticker buttons) */}
            <header className="h-16 px-4 md:px-6 bg-white border-b border-[#DCE8E0] flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveConversationId(null)}
                aria-label="Back to conversations"
                className="md:hidden min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-xl text-[#375242] hover:bg-[#EEF4F0] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                style={{
                  backgroundColor: activeConversation.other_user.avatar_color || '#166534',
                }}
              >
                {activeConversation.other_user.display_name.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <h1 className="text-sm font-semibold text-[#0F291A] truncate">
                    {activeConversation.other_user.display_name}
                  </h1>
                  <UserStatusInline
                    isOnline={activeConversation.other_user.is_online}
                    statusMessage={activeConversation.other_user.status_message}
                  />
                </div>
                <p className="text-xs text-[#547260] truncate">
                  {activeConversation.other_user.email}
                </p>
              </div>
            </header>

            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-3">
              {loadingMessages && (
                <div className="py-12 flex items-center justify-center gap-2 text-sm text-[#547260]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
                  <span>Loading messages...</span>
                </div>
              )}

              {messagesError && (
                <div
                  role="alert"
                  className="mx-auto max-w-md flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <span>{messagesError}</span>
                </div>
              )}

              {!loadingMessages && !messagesError && messages.length === 0 && (
                <div className="py-16 text-center space-y-1.5">
                  <p className="text-sm font-medium text-[#1F3A2A]">
                    No messages yet
                  </p>
                  <p className="text-xs text-[#63806F]">
                    Say hello to {activeConversation.other_user.display_name} below.
                  </p>
                </div>
              )}

              {!loadingMessages &&
                messages.map((msg, index) => {
                  const isMine = msg.sender_id === user.uid;
                  const previous = index > 0 ? messages[index - 1] : null;
                  const showDayDivider =
                    !previous ||
                    formatDayLabel(previous.created_at) !== formatDayLabel(msg.created_at);

                  return (
                    <div key={msg.id} className="space-y-3">
                      {showDayDivider && (
                        <div className="flex items-center justify-center py-2">
                          <span className="text-[11px] font-medium text-[#5A7866]">
                            {formatDayLabel(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div
                        className={`flex items-end gap-2 ${
                          isMine ? 'flex-row-reverse justify-start' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[75%] sm:max-w-[62%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                            isMine
                              ? 'bg-[#166534] text-white rounded-br-sm'
                              : 'bg-white text-[#112419] border border-[#D8E5DC] rounded-bl-sm'
                          } ${msg.pending ? 'opacity-75' : ''}`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>

                        <div
                          className={`flex flex-col ${
                            isMine ? 'items-end' : 'items-start'
                          } pb-0.5 shrink-0 text-[11px] font-mono tabular-nums text-[#526D5C]`}
                        >
                          <time
                            dateTime={msg.created_at}
                            title={formatFullTimestamp(msg.created_at)}
                          >
                            {formatShortTime(msg.created_at)}
                          </time>
                          {msg.pending && (
                            <span className="text-[10px] font-sans text-[#526D5C]">
                              Sending
                            </span>
                          )}
                          {msg.failed && (
                            <button
                              type="button"
                              onClick={() => void sendMessageContent(msg.content, msg.id)}
                              className="text-[10px] font-sans font-medium underline text-[#B91C1C] hover:text-[#991B1B]"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* Text Message Composer */}
            <form
              onSubmit={handleSendSubmit}
              className="px-4 md:px-6 py-3 bg-white border-t border-[#DCE8E0] flex items-end gap-2.5 shrink-0"
            >
              <textarea
                ref={composerRef}
                rows={1}
                value={draft}
                onChange={(e) => handleComposerChange(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={`Message ${activeConversation.other_user.display_name}...`}
                aria-label="Message text"
                className="flex-1 min-h-[44px] max-h-[140px] resize-none px-4 py-2.5 text-sm bg-[#F5F9F6] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-45 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </main>

      <NewChatModal
        isOpen={newChatOpen}
        currentUid={user.uid}
        onClose={() => setNewChatOpen(false)}
        onConversationOpened={handleConversationOpened}
      />

      <ProfileModal
        isOpen={profileOpen}
        profile={profile}
        email={user.email ?? ''}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={onProfileUpdated}
      />
    </div>
  );
}
