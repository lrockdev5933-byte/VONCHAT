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
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AlertCircle,
  Check,
  CheckCheck,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  SmilePlus,
  Sticker,
  User as UserIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth, signOut, type User } from '../lib/firebase';
import {
  addMessageReaction,
  fetchConversations,
  fetchMessages,
  formatSupabaseError,
  isBackendConfigured,
  markConversationRead,
  removeMessageReaction,
  searchMessagesAcrossConversations,
  sendStickerMessage,
  sendTextMessage,
  setConversationArchived,
  setPresenceStatus,
  subscribeToConversationMessages,
  subscribeToConversationReactions,
  subscribeToConversationUpdates,
  subscribeToProfileUpdates,
  subscribeToReadReceipt,
  subscribeToStatuses,
  subscribeToTypingIndicator,
  type TypingChannelController,
} from '../lib/chatService';
import type {
  ConversationListItem,
  Message,
  MessageReaction,
  MessageSearchResult,
  Profile,
  StatusItem,
} from '../types/chat';
import { getStickerById, VONCHAT_STICKERS, type VonSticker } from '../data/stickers';
import {
  DEFAULT_WALLPAPER_ID,
  getStoredWallpaperId,
  getWallpaperById,
  setStoredWallpaperId,
} from '../data/wallpapers';
import {
  getChatTextSizeConfig,
  getStoredChatTextSize,
  type ChatTextSize,
} from '../data/accessibility';
import { StickerArt } from './StickerArt';
import { VonChatLogo } from './VonChatLogo';
import { NewChatModal } from './NewChatModal';
import { ProfileModal } from './ProfileModal';
import { StatusComposerModal, StatusViewerModal } from './StatusModal';
import { useMessagePopSound } from '../hooks/useMessagePopSound';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, rawQuery: string, truncateForPreview = false) {
  const trimmed = rawQuery.trim();
  const tokens = Array.from(
    new Set(
      trimmed
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => b.length - a.length);

  let displayText = text;
  if (truncateForPreview && text.length > 130) {
    const lower = text.toLowerCase();
    const primaryTarget = trimmed.toLowerCase();
    let matchIndex = primaryTarget ? lower.indexOf(primaryTarget) : -1;
    if (matchIndex === -1 && tokens.length > 0) {
      matchIndex = lower.indexOf(tokens[0].toLowerCase());
    }
    if (matchIndex > 40) {
      const start = Math.max(0, matchIndex - 32);
      const end = Math.min(text.length, start + 130);
      displayText = `${start > 0 ? '...' : ''}${text.slice(start, end)}${
        end < text.length ? '...' : ''
      }`;
    } else {
      displayText = `${text.slice(0, 130)}...`;
    }
  }

  if (tokens.length === 0) {
    return displayText;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  const parts = displayText.split(pattern);

  return parts.map((part, idx) => {
    const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      return (
        <mark
          key={idx}
          className="bg-[#DCFCE7] text-[#14532D] rounded-xs px-0.5 font-semibold"
        >
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function ChatWorkspace({
  user,
  profile,
  profileSyncError,
  onProfileUpdated,
}: ChatWorkspaceProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(isBackendConfigured);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'chats' | 'messages'>('chats');
  const [showArchived, setShowArchived] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<MessageSearchResult[]>([]);
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(
    null
  );
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [statusComposerOpen, setStatusComposerOpen] = useState(false);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);
  const [viewedStatusIds, setViewedStatusIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(`vonchat_viewed_statuses_${user.uid}`);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });
  const [wallpaperId, setWallpaperId] = useState<string>(
    () =>
      profile?.chat_wallpaper ??
      getStoredWallpaperId(user.uid) ??
      DEFAULT_WALLPAPER_ID
  );
  const [chatTextSize, setChatTextSize] = useState<ChatTextSize>(() =>
    getStoredChatTextSize(user.uid)
  );

  useEffect(() => {
    setChatTextSize(getStoredChatTextSize(user.uid));
    try {
      const raw = window.localStorage.getItem(`vonchat_viewed_statuses_${user.uid}`);
      if (!raw) {
        setViewedStatusIds(new Set());
      } else {
        const parsed = JSON.parse(raw);
        setViewedStatusIds(
          Array.isArray(parsed)
            ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
            : new Set()
        );
      }
    } catch {
      setViewedStatusIds(new Set());
    }
  }, [user.uid]);

  useEffect(() => {
    if (profile?.chat_wallpaper) {
      setWallpaperId(profile.chat_wallpaper);
      setStoredWallpaperId(user.uid, profile.chat_wallpaper);
    }
  }, [profile?.chat_wallpaper, user.uid]);

  const activeWallpaper = useMemo(() => getWallpaperById(wallpaperId), [wallpaperId]);
  const textSizeConfig = useMemo(() => getChatTextSizeConfig(chatTextSize), [chatTextSize]);
  const { playPop, isMuted: isSoundMuted, toggleMuted: toggleSoundMuted } = useMessagePopSound({
    volume: 0.08,
    storageKey: `vonchat_sound_muted_${user.uid}`,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messageRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const seenIncomingIdsRef = useRef<Set<string>>(new Set());
  const typingControllerRef = useRef<TypingChannelController | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const localTypingStopTimerRef = useRef<number | null>(null);

  const loadConversations = useCallback(async () => {
    if (!isBackendConfigured) {
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
    if (!isBackendConfigured) return;
    const unsubscribe = subscribeToConversationUpdates(user.uid, () => {
      void loadConversations();
    });
    return unsubscribe;
  }, [user.uid, loadConversations]);

  useEffect(() => {
    if (!isBackendConfigured) {
      setStatuses([]);
      return;
    }
    return subscribeToStatuses(user.uid, (nextStatuses) => {
      setStatuses(nextStatuses);
    });
  }, [user.uid]);

  const handleMarkStatusViewedLocal = useCallback(
    (statusId: string) => {
      setViewedStatusIds((prev) => {
        if (prev.has(statusId)) return prev;
        const next = new Set(prev);
        next.add(statusId);
        try {
          const trimmed = Array.from(next).slice(-150);
          window.localStorage.setItem(
            `vonchat_viewed_statuses_${user.uid}`,
            JSON.stringify(trimmed)
          );
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    },
    [user.uid]
  );

  const handleStatusCreated = useCallback((created: StatusItem) => {
    setStatuses((prev) => {
      if (prev.some((s) => s.id === created.id)) return prev;
      return [...prev, created].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const handleStatusDeleted = useCallback((deletedId: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== deletedId));
  }, []);

  const watchedOtherUserIdsKey = useMemo(
    () =>
      Array.from(new Set(conversations.map((c) => c.other_user.id)))
        .sort()
        .join(','),
    [conversations]
  );

  useEffect(() => {
    if (!isBackendConfigured) return;
    const watchedIds = watchedOtherUserIdsKey ? watchedOtherUserIdsKey.split(',') : [];
    if (watchedIds.length === 0) return;

    const unsubscribe = subscribeToProfileUpdates(watchedIds, (updatedProfile) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.other_user.id === updatedProfile.id
            ? {
                ...conv,
                other_user: {
                  ...updatedProfile,
                  email: updatedProfile.email || conv.other_user.email,
                },
              }
            : conv
        )
      );
    });
    return unsubscribe;
  }, [watchedOtherUserIdsKey]);

  useEffect(() => {
    if (!activeConversationId || !isBackendConfigured) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setMessagesError(null);

    // Optimistically clear unread badge for the active conversation and persist read state
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversationId ? { ...c, unread_count: 0 } : c))
    );
    void markConversationRead(activeConversationId, user.uid).catch(() => {
      // Non-fatal if schema migration hasn't added mark_conversation_read yet
    });

    seenIncomingIdsRef.current.clear();

    fetchMessages(activeConversationId, user.uid)
      .then((rows) => {
        if (!cancelled) {
          rows.forEach((r) => seenIncomingIdsRef.current.add(r.id));
          setMessages(rows);
          const latest = rows[rows.length - 1];
          if (latest && latest.sender_id !== user.uid) {
            void markConversationRead(activeConversationId, user.uid, latest.created_at).catch(
              () => {}
            );
          }
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

    const unsubscribe = subscribeToConversationMessages(
      activeConversationId,
      user.uid,
      (incoming) => {
        const isNewFromOther =
          incoming.sender_id !== user.uid &&
          !seenIncomingIdsRef.current.has(incoming.id);
        seenIncomingIdsRef.current.add(incoming.id);

        if (incoming.sender_id !== user.uid) {
          setOtherUserTyping(false);
        }
        if (isNewFromOther) {
          playPop();
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) {
            return prev;
          }
          return [...prev, incoming].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          );
        });
        if (incoming.sender_id !== user.uid) {
          void markConversationRead(activeConversationId, user.uid, incoming.created_at)
            .catch(() => {})
            .finally(() => {
              void loadConversations();
            });
        } else {
          void loadConversations();
        }
      }
    );

    const unsubscribeReactions = subscribeToConversationReactions(
      activeConversationId,
      user.uid,
      (inserted) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== inserted.message_id) return m;
            const current = m.reactions ?? [];
            const alreadyPresent = current.some(
              (r) =>
                r.id === inserted.id ||
                (r.user_id === inserted.user_id && r.emoji === inserted.emoji)
            );
            if (alreadyPresent) {
              return {
                ...m,
                reactions: current.map((r) =>
                  r.user_id === inserted.user_id && r.emoji === inserted.emoji ? inserted : r
                ),
              };
            }
            return { ...m, reactions: [...current, inserted] };
          })
        );
      },
      (removed) => {
        setMessages((prev) =>
          prev.map((m) => {
            const current = m.reactions ?? [];
            if (current.length === 0) return m;
            const filtered = current.filter((r) => {
              if (removed.id && r.id === removed.id) return false;
              if (
                removed.message_id &&
                removed.user_id &&
                removed.emoji &&
                r.message_id === removed.message_id &&
                r.user_id === removed.user_id &&
                r.emoji === removed.emoji
              ) {
                return false;
              }
              return true;
            });
            return filtered.length === current.length ? m : { ...m, reactions: filtered };
          })
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeReactions();
    };
  }, [activeConversationId, loadConversations, user.uid, playPop]);

  useEffect(() => {
    setActiveReactionPickerMessageId(null);
    setStickerPickerOpen(false);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeReactionPickerMessageId && !stickerPickerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        activeReactionPickerMessageId &&
        !target?.closest('[data-reaction-controls="true"]')
      ) {
        setActiveReactionPickerMessageId(null);
      }
      if (stickerPickerOpen && !target?.closest('[data-sticker-controls="true"]')) {
        setStickerPickerOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveReactionPickerMessageId(null);
        setStickerPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeReactionPickerMessageId, stickerPickerOpen]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const activeOtherUserId = activeConversation?.other_user.id ?? null;

  useEffect(() => {
    setOtherUserTyping(false);
    lastTypingSentAtRef.current = 0;
    if (localTypingStopTimerRef.current !== null) {
      window.clearTimeout(localTypingStopTimerRef.current);
      localTypingStopTimerRef.current = null;
    }

    if (!activeConversationId || !activeOtherUserId || !isBackendConfigured) {
      typingControllerRef.current = null;
      return;
    }

    const controller = subscribeToTypingIndicator(
      activeConversationId,
      user.uid,
      activeOtherUserId,
      (isTyping) => {
        setOtherUserTyping(isTyping);
      }
    );
    typingControllerRef.current = controller;

    return () => {
      if (localTypingStopTimerRef.current !== null) {
        window.clearTimeout(localTypingStopTimerRef.current);
        localTypingStopTimerRef.current = null;
      }
      controller.unsubscribe();
      if (typingControllerRef.current === controller) {
        typingControllerRef.current = null;
      }
    };
  }, [activeConversationId, activeOtherUserId, user.uid]);

  useEffect(() => {
    setOtherLastReadAt(null);
    if (!activeConversationId || !activeOtherUserId || !isBackendConfigured) {
      return;
    }

    return subscribeToReadReceipt(activeConversationId, activeOtherUserId, (lastReadAt) => {
      setOtherLastReadAt(lastReadAt);
    });
  }, [activeConversationId, activeOtherUserId]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchMode('messages');
        window.setTimeout(() => {
          searchInputRef.current?.focus();
        }, 0);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (searchMode !== 'messages' || !isBackendConfigured) {
      setMessageSearchResults([]);
      setSearchingMessages(false);
      setMessageSearchError(null);
      return;
    }

    const trimmed = searchFilter.trim();
    if (!trimmed) {
      setMessageSearchResults([]);
      setSearchingMessages(false);
      setMessageSearchError(null);
      return;
    }

    let cancelled = false;
    setSearchingMessages(true);
    setMessageSearchError(null);

    const timer = window.setTimeout(() => {
      searchMessagesAcrossConversations(user.uid, trimmed, conversations)
        .then((results) => {
          if (!cancelled) {
            setMessageSearchResults(results);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setMessageSearchError(formatSupabaseError(err));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchingMessages(false);
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchMode, searchFilter, user.uid, conversations]);

  useEffect(() => {
    if (loadingMessages || !pendingScrollMessageId) {
      return;
    }
    const targetEl = messageRowRefs.current.get(pendingScrollMessageId);
    if (!targetEl) {
      return;
    }

    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(pendingScrollMessageId);
    setPendingScrollMessageId(null);

    const timer = window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [loadingMessages, pendingScrollMessageId, messages]);

  useEffect(() => {
    if (pendingScrollMessageId) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConversationId, otherUserTyping, pendingScrollMessageId]);

  const archivedCount = useMemo(
    () => conversations.filter((conv) => conv.archived).length,
    [conversations]
  );
  const chatsCount = conversations.length - archivedCount;

  const filteredConversations = useMemo(() => {
    const scoped = conversations.filter((conv) =>
      showArchived ? conv.archived : !conv.archived
    );
    const q = searchFilter.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((conv) => {
      const name = conv.other_user.display_name.toLowerCase();
      const email = conv.other_user.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [conversations, searchFilter, showArchived]);

  const visibleToContactUids = useMemo(
    () => Array.from(new Set(conversations.map((conv) => conv.other_user.id))),
    [conversations]
  );

  const myStatuses = useMemo(
    () => statuses.filter((item) => item.author_id === user.uid),
    [statuses, user.uid]
  );

  const contactStatusGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        authorId: string;
        authorName: string;
        authorAvatarColor: string;
        items: StatusItem[];
        hasUnviewed: boolean;
        latestAt: string;
      }
    >();

    for (const item of statuses) {
      if (item.author_id === user.uid) continue;
      const isViewed = viewedStatusIds.has(item.id);
      const existing = grouped.get(item.author_id);
      if (existing) {
        existing.items.push(item);
        if (!isViewed) existing.hasUnviewed = true;
        if (item.created_at > existing.latestAt) {
          existing.latestAt = item.created_at;
        }
      } else {
        grouped.set(item.author_id, {
          authorId: item.author_id,
          authorName: item.author_name,
          authorAvatarColor: item.author_avatar_color,
          items: [item],
          hasUnviewed: !isViewed,
          latestAt: item.created_at,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.hasUnviewed !== b.hasUnviewed) {
        return a.hasUnviewed ? -1 : 1;
      }
      return b.latestAt.localeCompare(a.latestAt);
    });
  }, [statuses, user.uid, viewedStatusIds]);

  const activeViewerStatuses = useMemo(() => {
    if (!viewerAuthorId) return [];
    if (viewerAuthorId === user.uid) return myStatuses;
    return (
      contactStatusGroups.find((group) => group.authorId === viewerAuthorId)?.items ?? []
    );
  }, [viewerAuthorId, user.uid, myStatuses, contactStatusGroups]);

  const stopLocalTypingBroadcast = useCallback(() => {
    if (localTypingStopTimerRef.current !== null) {
      window.clearTimeout(localTypingStopTimerRef.current);
      localTypingStopTimerRef.current = null;
    }
    lastTypingSentAtRef.current = 0;
    typingControllerRef.current?.sendTyping(false);
  }, []);

  const sendSticker = async (sticker: VonSticker, retryTempId?: string) => {
    if (!activeConversationId || !isBackendConfigured) return;

    stopLocalTypingBroadcast();
    setStickerPickerOpen(false);

    const tempId = retryTempId ?? `temp-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.uid,
      content: `Sticker: ${sticker.label}`,
      message_type: 'sticker',
      sticker_id: sticker.id,
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
    }

    setSending(true);
    try {
      const saved = await sendStickerMessage(
        activeConversationId,
        user.uid,
        sticker.id,
        sticker.label
      );
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

  const sendMessageContent = async (textToSend: string, retryTempId?: string) => {
    if (!activeConversationId || !isBackendConfigured) return;
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    stopLocalTypingBroadcast();

    const tempId = retryTempId ?? `temp-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.uid,
      content: trimmed,
      message_type: 'text',
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

    if (!value.trim()) {
      stopLocalTypingBroadcast();
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 1500) {
      lastTypingSentAtRef.current = now;
      typingControllerRef.current?.sendTyping(true);
    }

    if (localTypingStopTimerRef.current !== null) {
      window.clearTimeout(localTypingStopTimerRef.current);
    }
    localTypingStopTimerRef.current = window.setTimeout(() => {
      stopLocalTypingBroadcast();
    }, 2500);
  };

  const handleToggleReaction = async (message: Message, emoji: string) => {
    if (message.pending || message.failed || !activeConversationId) return;

    const currentReactions = message.reactions ?? [];
    const existingMine = currentReactions.find(
      (r) => r.user_id === user.uid && r.emoji === emoji
    );

    setActiveReactionPickerMessageId(null);

    if (existingMine) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                reactions: (m.reactions ?? []).filter(
                  (r) => !(r.user_id === user.uid && r.emoji === emoji)
                ),
              }
            : m
        )
      );

      try {
        await removeMessageReaction(message.id, activeConversationId, user.uid, emoji);
      } catch (err) {
        setMessagesError(formatSupabaseError(err));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, reactions: [...(m.reactions ?? []), existingMine] }
              : m
          )
        );
      }
      return;
    }

    const tempReaction: MessageReaction = {
      id: `temp-${crypto.randomUUID()}`,
      message_id: message.id,
      conversation_id: activeConversationId,
      user_id: user.uid,
      emoji,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, reactions: [...(m.reactions ?? []), tempReaction] }
          : m
      )
    );

    try {
      const saved = await addMessageReaction(
        message.id,
        activeConversationId,
        user.uid,
        emoji
      );
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m;
          const withoutTemp = (m.reactions ?? []).filter((r) => r.id !== tempReaction.id);
          if (
            withoutTemp.some(
              (r) => r.id === saved.id || (r.user_id === saved.user_id && r.emoji === saved.emoji)
            )
          ) {
            return { ...m, reactions: withoutTemp };
          }
          return { ...m, reactions: [...withoutTemp, saved] };
        })
      );
    } catch (err) {
      setMessagesError(formatSupabaseError(err));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                reactions: (m.reactions ?? []).filter((r) => r.id !== tempReaction.id),
              }
            : m
        )
      );
    }
  };

  const handleToggleArchive = async (conversationId: string, nextArchived: boolean) => {
    if (!isBackendConfigured) return;
    const previousState =
      conversations.find((c) => c.id === conversationId)?.archived ?? false;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, archived: nextArchived } : c
      )
    );

    try {
      await setConversationArchived(conversationId, user.uid, nextArchived);
      void loadConversations();
    } catch (err) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, archived: previousState } : c
        )
      );
      setConversationsError(formatSupabaseError(err));
    }
  };

  const handleConversationOpened = async (conversationId: string) => {
    const existing = conversations.find((c) => c.id === conversationId);
    if (existing?.archived) {
      await setConversationArchived(conversationId, user.uid, false).catch(() => {});
    }
    setShowArchived(false);
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
              disabled={!isBackendConfigured}
              onClick={() => {
                if (searchMode === 'messages') {
                  setSearchMode('chats');
                } else {
                  setSearchMode('messages');
                  window.setTimeout(() => searchInputRef.current?.focus(), 0);
                }
              }}
              aria-pressed={searchMode === 'messages'}
              aria-label="Search message history"
              title={
                searchMode === 'messages'
                  ? 'Exit message search'
                  : 'Search chat history (Ctrl+K)'
              }
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
                searchMode === 'messages'
                  ? 'bg-[#DCFCE7] text-[#14532D]'
                  : 'text-[#375242] hover:bg-[#DFECE3] hover:text-[#0F291A]'
              }`}
            >
              <Search className="w-4.5 h-4.5" />
            </button>
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
              disabled={!isBackendConfigured}
              onClick={() => setNewChatOpen(true)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>New chat</span>
            </button>
          </div>
        </div>

        {/* 24h Status Updates Strip (Pictures, Videos, Text, Stickers) */}
        {isBackendConfigured && (
          <section
            aria-label="24-hour status updates"
            className="px-3 py-2.5 border-b border-[#DCE8E0] bg-[#E7F0EA]/60 shrink-0"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4B6856]">
                Status updates
              </span>
              <button
                type="button"
                onClick={() => setStatusComposerOpen(true)}
                className="text-[11px] font-semibold text-[#15803D] hover:text-[#14532D] inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
            <div className="flex items-start gap-3 overflow-x-auto pb-0.5">
              {/* My Status Tile */}
              <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      myStatuses.length > 0
                        ? setViewerAuthorId(user.uid)
                        : setStatusComposerOpen(true)
                    }
                    aria-label={
                      myStatuses.length > 0
                        ? `View your ${myStatuses.length} active status updates`
                        : 'Add your status update'
                    }
                    className={`w-11 h-11 rounded-full p-0.5 transition-transform hover:scale-105 ${
                      myStatuses.length > 0
                        ? 'ring-2 ring-[#15803D] bg-white'
                        : 'ring-1 ring-[#B8CEC0] bg-white'
                    }`}
                  >
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold text-white"
                      style={{ backgroundColor: profile?.avatar_color || '#166534' }}
                    >
                      {myInitials}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusComposerOpen(true)}
                    aria-label="Add new status"
                    title="Add status (pic, video, text, sticker)"
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#15803D] hover:bg-[#166534] text-white border-2 border-[#ECF3EE] flex items-center justify-center shadow-xs transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[11px] font-medium text-[#1F3A2A] truncate w-full text-center">
                  {myStatuses.length > 0 ? `You (${myStatuses.length})` : 'My status'}
                </span>
              </div>

              {/* Contacts' Statuses */}
              {contactStatusGroups.map((group) => {
                const initials = (group.authorName || 'VC').slice(0, 2).toUpperCase();
                const firstName = group.authorName.split(' ')[0] || group.authorName;
                return (
                  <button
                    key={group.authorId}
                    type="button"
                    onClick={() => setViewerAuthorId(group.authorId)}
                    aria-label={`View ${group.authorName}'s status (${group.items.length})`}
                    className="flex flex-col items-center gap-1 shrink-0 w-14 group"
                  >
                    <div
                      className={`w-11 h-11 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                        group.hasUnviewed
                          ? 'ring-2 ring-[#15803D] bg-white'
                          : 'ring-2 ring-[#B8CEC0] bg-white'
                      }`}
                    >
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: group.authorAvatarColor || '#166534' }}
                      >
                        {initials}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] truncate w-full text-center ${
                        group.hasUnviewed
                          ? 'font-semibold text-[#0F291A]'
                          : 'font-medium text-[#547260]'
                      }`}
                    >
                      {firstName}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Conversations & Archived Tabs + Search */}
        <div className="p-3 border-b border-[#DCE8E0] space-y-2 shrink-0">
          <div
            className="grid grid-cols-2 gap-1 p-1 bg-[#DCE8E0]/80 rounded-xl"
            role="tablist"
            aria-label="Chat view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === 'chats' && !showArchived}
              onClick={() => {
                setSearchMode('chats');
                setShowArchived(false);
              }}
              className={`min-h-[32px] px-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                searchMode === 'chats' && !showArchived
                  ? 'bg-white text-[#0F291A] shadow-xs'
                  : 'text-[#4B6856] hover:text-[#0F291A]'
              }`}
            >
              <span>Chats</span>
              <span className="font-mono text-[11px] tabular-nums text-[#63806F]">
                {chatsCount}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === 'chats' && showArchived}
              onClick={() => {
                setSearchMode('chats');
                setShowArchived(true);
              }}
              className={`min-h-[32px] px-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                searchMode === 'chats' && showArchived
                  ? 'bg-white text-[#0F291A] shadow-xs'
                  : 'text-[#4B6856] hover:text-[#0F291A]'
              }`}
            >
              <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Archived</span>
              <span className="font-mono text-[11px] tabular-nums text-[#63806F]">
                {archivedCount}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#63806F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={
                searchMode === 'chats'
                  ? showArchived
                    ? 'Filter archived chats...'
                    : 'Filter chats by name...'
                  : 'Search text across all chats...'
              }
              aria-label={
                searchMode === 'chats'
                  ? 'Filter conversations by participant name'
                  : 'Search text across all chat history'
              }
              className="w-full min-h-[40px] pl-9 pr-9 py-2 text-sm bg-white border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-[#63806F] hover:text-[#0F291A] hover:bg-[#EEF4F0] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List or Message Search Results */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!isBackendConfigured && (
            <div className="m-2 rounded-xl border border-[#C7DBD0] bg-white p-4 space-y-2 text-xs text-[#375242]">
              <p className="font-semibold text-[#0F291A]">
                Connect database to enable messaging
              </p>
              <p className="leading-relaxed">
                Configure Firebase Firestore or Supabase environment variables to store conversations and messages.
              </p>
            </div>
          )}

          {(profileSyncError || conversationsError || (searchMode === 'messages' && messageSearchError)) && (
            <div
              role="alert"
              className="m-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>
                {profileSyncError ||
                  (searchMode === 'messages' ? messageSearchError : null) ||
                  conversationsError}
              </span>
            </div>
          )}

          {searchMode === 'messages' ? (
            <>
              {!searchFilter.trim() && (
                <div className="px-4 py-12 text-center space-y-2">
                  <p className="text-sm font-medium text-[#1F3A2A]">
                    Search your chat history
                  </p>
                  <p className="text-xs text-[#547260] leading-relaxed">
                    Type words or phrases above to find matching messages across every conversation.
                  </p>
                </div>
              )}

              {searchFilter.trim() && searchingMessages && (
                <div className="py-12 flex items-center justify-center gap-2 text-sm text-[#547260]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
                  <span>Searching messages...</span>
                </div>
              )}

              {searchFilter.trim() &&
                !searchingMessages &&
                !messageSearchError &&
                messageSearchResults.length === 0 && (
                  <div className="px-4 py-12 text-center space-y-3">
                    <p className="text-sm font-medium text-[#1F3A2A]">
                      No matching messages
                    </p>
                    <p className="text-xs text-[#547260]">
                      No messages across your conversations contain &ldquo;{searchFilter.trim()}&rdquo;.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#F3F8F5] text-[#1F3A2A] text-xs font-semibold transition-colors"
                    >
                      Clear search
                    </button>
                  </div>
                )}

              {searchFilter.trim() &&
                !searchingMessages &&
                messageSearchResults.length > 0 && (
                  <>
                    <div className="px-2 py-1 flex items-center justify-between text-[11px] text-[#547260]">
                      <span>
                        {messageSearchResults.length} match
                        {messageSearchResults.length === 1 ? '' : 'es'} across chats
                      </span>
                    </div>
                    {messageSearchResults.map((result) => {
                      const isMine = result.message.sender_id === user.uid;
                      const senderLabel = isMine
                        ? 'You'
                        : result.other_user.display_name.split(' ')[0];
                      const initials = result.other_user.display_name
                        .slice(0, 2)
                        .toUpperCase();
                      const isActiveMatch =
                        result.conversation_id === activeConversationId &&
                        result.message.id === highlightedMessageId;

                      return (
                        <button
                          key={`${result.conversation_id}:${result.message.id}`}
                          type="button"
                          onClick={() => {
                            setPendingScrollMessageId(result.message.id);
                            setActiveConversationId(result.conversation_id);
                          }}
                          className={`w-full text-left px-3 py-3 rounded-xl flex items-start gap-3 transition-colors border ${
                            isActiveMatch
                              ? 'bg-white border-[#86EFAC] ring-1 ring-[#16A34A]/40 shadow-xs'
                              : 'bg-white/75 border-transparent hover:bg-white hover:border-[#C5DACD]'
                          }`}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5"
                            style={{
                              backgroundColor: result.other_user.avatar_color || '#166534',
                            }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[#0F291A] truncate">
                                {result.other_user.display_name}
                              </span>
                              <span className="text-[11px] font-mono tabular-nums text-[#63806F] shrink-0">
                                {formatListTime(result.message.created_at)} ·{' '}
                                {formatShortTime(result.message.created_at)}
                              </span>
                            </div>
                            <p
                              className={`${textSizeConfig.sidebarPreviewClass} text-[#2E4B3A] leading-snug line-clamp-2 break-words`}
                            >
                              <span className="font-medium text-[#547260]">
                                {senderLabel}:{' '}
                              </span>
                              {renderHighlightedText(
                                result.message.content,
                                searchFilter,
                                true
                              )}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
            </>
          ) : (
            <>
              {loadingConversations && (
                <div className="py-12 flex items-center justify-center gap-2 text-sm text-[#547260]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
                  <span>Loading conversations...</span>
                </div>
              )}

              {!loadingConversations &&
                isBackendConfigured &&
                filteredConversations.length === 0 && (
                  <div className="px-4 py-12 text-center space-y-3">
                    <p className="text-sm font-medium text-[#1F3A2A]">
                      {searchFilter.trim()
                        ? 'No matching conversations'
                        : showArchived
                          ? 'No archived chats'
                          : conversations.length > 0
                            ? 'No active chats'
                            : 'No conversations yet'}
                    </p>
                    <p className="text-xs text-[#547260]">
                      {searchFilter.trim()
                        ? `No participant matches "${searchFilter.trim()}".`
                        : showArchived
                          ? 'Conversations you archive from Chats will appear here.'
                          : conversations.length > 0
                            ? 'All your conversations are currently archived.'
                            : 'Find someone by their email address to start your first chat.'}
                    </p>
                    {searchFilter.trim() ? (
                      <div className="flex flex-col items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSearchMode('messages')}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold transition-colors"
                        >
                          Search &ldquo;{searchFilter.trim()}&rdquo; in messages
                        </button>
                        <button
                          type="button"
                          onClick={() => setSearchFilter('')}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#F3F8F5] text-[#1F3A2A] text-xs font-medium transition-colors"
                        >
                          Clear filter
                        </button>
                      </div>
                    ) : showArchived ? (
                      <button
                        type="button"
                        onClick={() => setShowArchived(false)}
                        className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#F3F8F5] text-[#1F3A2A] text-xs font-semibold transition-colors"
                      >
                        Back to Chats
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
                  const unreadCount = isSelected ? 0 : conv.unread_count;
                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-1 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-white border-[#C5DACD] shadow-xs'
                          : 'bg-transparent border-transparent hover:bg-[#E2EDE6]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveConversationId(conv.id)}
                        className="min-w-0 flex-1 text-left px-3 py-3 flex items-center gap-3 rounded-xl"
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
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p
                              className={`${textSizeConfig.sidebarPreviewClass} truncate ${
                                unreadCount > 0
                                  ? 'font-semibold text-[#0F291A]'
                                  : 'text-[#547260]'
                              }`}
                            >
                              {conv.last_message_preview || conv.other_user.email}
                            </p>
                            {unreadCount > 0 && (
                              <span
                                aria-label={`${unreadCount} unread message${
                                  unreadCount === 1 ? '' : 's'
                                }`}
                                className="min-w-[20px] h-5 px-1.5 rounded-md bg-[#15803D] text-white text-[11px] font-semibold font-mono tabular-nums inline-flex items-center justify-center shrink-0"
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleArchive(conv.id, !conv.archived)}
                        aria-label={
                          conv.archived
                            ? `Unarchive chat with ${conv.other_user.display_name}`
                            : `Archive chat with ${conv.other_user.display_name}`
                        }
                        title={
                          conv.archived
                            ? 'Move back to Chats'
                            : 'Archive conversation'
                        }
                        className={`mr-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-[#547260] hover:text-[#0F291A] hover:bg-[#D5E4DA] transition-all shrink-0 ${
                          conv.archived
                            ? 'opacity-100'
                            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
                        }`}
                      >
                        {conv.archived ? (
                          <ArchiveRestore className="w-4 h-4 text-[#15803D]" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
            </>
          )}
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
        } flex-1 flex-col bg-[#F7FAF8] min-w-0 transition-[background-color] duration-300`}
        style={activeWallpaper.style}
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
                disabled={!isBackendConfigured}
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
            <header className="h-16 px-4 md:px-6 bg-white/95 backdrop-blur-xs border-b border-[#DCE8E0] flex items-center gap-3 shrink-0">
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
                  {activeConversation.other_user.email ||
                    (activeConversation.other_user.is_online
                      ? 'Active in vonChat'
                      : 'vonChat member')}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleToggleArchive(
                    activeConversation.id,
                    !activeConversation.archived
                  )
                }
                aria-pressed={activeConversation.archived}
                aria-label={
                  activeConversation.archived
                    ? 'Unarchive conversation'
                    : 'Archive conversation'
                }
                title={
                  activeConversation.archived
                    ? 'Move back to Chats'
                    : 'Archive conversation'
                }
                className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors shrink-0 ${
                  activeConversation.archived
                    ? 'text-[#15803D] bg-[#ECFDF5] hover:bg-[#DCFCE7]'
                    : 'text-[#63806F] hover:bg-[#EEF4F0] hover:text-[#0F291A]'
                }`}
              >
                {activeConversation.archived ? (
                  <ArchiveRestore className="w-4.5 h-4.5" />
                ) : (
                  <Archive className="w-4.5 h-4.5" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleSoundMuted}
                aria-pressed={isSoundMuted}
                aria-label={
                  isSoundMuted
                    ? 'Unmute message notification sound'
                    : 'Mute message notification sound'
                }
                title={
                  isSoundMuted
                    ? 'Message sound muted (click to enable)'
                    : 'Message sound on (click to mute)'
                }
                className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors shrink-0 ${
                  isSoundMuted
                    ? 'text-[#63806F] hover:bg-[#EEF4F0] hover:text-[#0F291A]'
                    : 'text-[#15803D] bg-[#ECFDF5] hover:bg-[#DCFCE7]'
                }`}
              >
                {isSoundMuted ? (
                  <VolumeX className="w-4.5 h-4.5" />
                ) : (
                  <Volume2 className="w-4.5 h-4.5" />
                )}
              </button>
            </header>

            {activeConversation.archived && (
              <div className="px-4 md:px-6 py-2 bg-[#F0F7F2]/95 border-b border-[#DCE8E0] flex items-center justify-between gap-3 text-xs text-[#375242] shrink-0">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Archive className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                  <span className="truncate">
                    Archived conversation — hidden from your main Chats list.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleToggleArchive(activeConversation.id, false)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#CFE0D5] hover:bg-[#EEF4F0] text-[#14532D] font-semibold shrink-0 transition-colors"
                >
                  Unarchive
                </button>
              </div>
            )}

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
                  <p className={`${textSizeConfig.messageClass} font-medium text-[#1F3A2A]`}>
                    No messages yet
                  </p>
                  <p className={`${textSizeConfig.metaClass} text-[#63806F]`}>
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

                  const groupedReactions = Array.from(
                    (msg.reactions ?? []).reduce((map, r) => {
                      const entry = map.get(r.emoji) ?? {
                        emoji: r.emoji,
                        count: 0,
                        reactedByMe: false,
                      };
                      entry.count += 1;
                      if (r.user_id === user.uid) {
                        entry.reactedByMe = true;
                      }
                      map.set(r.emoji, entry);
                      return map;
                    }, new Map<string, { emoji: string; count: number; reactedByMe: boolean }>())
                  ).map(([, value]) => value);

                  const isPickerOpen = activeReactionPickerMessageId === msg.id;
                  const sticker =
                    msg.message_type === 'sticker' ? getStickerById(msg.sticker_id) : undefined;

                  const isHighlighted = highlightedMessageId === msg.id;
                  const msgMs = Date.parse(msg.created_at);
                  const readMs = otherLastReadAt ? Date.parse(otherLastReadAt) : NaN;
                  const isReadByOther =
                    isMine &&
                    !msg.pending &&
                    !msg.failed &&
                    Boolean(otherLastReadAt) &&
                    (!Number.isNaN(msgMs) && !Number.isNaN(readMs)
                      ? msgMs <= readMs
                      : msg.created_at <= (otherLastReadAt ?? ''));

                  return (
                    <div
                      key={msg.id}
                      ref={(el) => {
                        if (el) {
                          messageRowRefs.current.set(msg.id, el);
                        } else {
                          messageRowRefs.current.delete(msg.id);
                        }
                      }}
                      className="space-y-3"
                    >
                      {showDayDivider && (
                        <div className="flex items-center justify-center py-2">
                          <span className="text-[11px] font-medium text-[#5A7866]">
                            {formatDayLabel(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div
                        className={`group flex flex-col ${
                          isMine ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`flex items-end gap-2 max-w-full ${
                            isMine ? 'flex-row-reverse justify-start' : 'justify-start'
                          }`}
                        >
                          {sticker ? (
                            <div
                              className={`p-2 rounded-2xl border border-[#D8E5DC] bg-white/80 transition-shadow ${
                                msg.pending ? 'opacity-75' : ''
                              } ${
                                isHighlighted
                                  ? 'ring-2 ring-[#16A34A] ring-offset-2'
                                  : ''
                              }`}
                            >
                              <StickerArt
                                stickerId={sticker.id}
                                className="w-24 h-24 sm:w-28 sm:h-28"
                              />
                              <p
                                className={`mt-1 ${textSizeConfig.metaClass} font-medium text-[#375242] text-center`}
                              >
                                {sticker.label}
                              </p>
                            </div>
                          ) : (
                            <div
                              className={`max-w-[75%] sm:max-w-[62%] px-4 py-2.5 rounded-2xl ${textSizeConfig.messageClass} break-words transition-shadow ${
                                isMine
                                  ? 'bg-[#166534] text-white rounded-br-sm'
                                  : 'bg-white text-[#112419] border border-[#D8E5DC] rounded-bl-sm'
                              } ${msg.pending ? 'opacity-75' : ''} ${
                                isHighlighted
                                  ? 'ring-2 ring-[#16A34A] ring-offset-2'
                                  : ''
                              }`}
                            >
                              <p className="whitespace-pre-wrap">
                                {isHighlighted && searchMode === 'messages' && searchFilter.trim()
                                  ? renderHighlightedText(msg.content, searchFilter)
                                  : msg.content}
                              </p>
                            </div>
                          )}

                          <div
                            className={`flex items-end gap-1.5 pb-0.5 shrink-0 ${
                              isMine ? 'flex-row-reverse' : 'flex-row'
                            }`}
                          >
                            <div
                              className={`flex flex-col ${
                                isMine ? 'items-end' : 'items-start'
                              } text-[11px] font-mono tabular-nums text-[#526D5C]`}
                            >
                              <div className="inline-flex items-center gap-1">
                                <time
                                  dateTime={msg.created_at}
                                  title={formatFullTimestamp(msg.created_at)}
                                >
                                  {formatShortTime(msg.created_at)}
                                </time>
                                {isMine && !msg.pending && !msg.failed && (
                                  <span
                                    role="img"
                                    aria-label={isReadByOther ? 'Read' : 'Sent'}
                                    title={
                                      isReadByOther && otherLastReadAt
                                        ? `Read · ${formatFullTimestamp(otherLastReadAt)}`
                                        : 'Sent'
                                    }
                                    data-read-status={isReadByOther ? 'read' : 'sent'}
                                    className={`inline-flex items-center ${
                                      isReadByOther ? 'text-[#15803D]' : 'text-[#7B9685]'
                                    }`}
                                  >
                                    {isReadByOther ? (
                                      <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                    )}
                                  </span>
                                )}
                              </div>
                              {msg.pending && (
                                <span className="text-[10px] font-sans text-[#526D5C]">
                                  Sending
                                </span>
                              )}
                              {msg.failed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    sticker
                                      ? void sendSticker(sticker, msg.id)
                                      : void sendMessageContent(msg.content, msg.id)
                                  }
                                  className="text-[10px] font-sans font-medium underline text-[#B91C1C] hover:text-[#991B1B]"
                                >
                                  Retry
                                </button>
                              )}
                            </div>

                            {!msg.pending && !msg.failed && (
                              <div className="relative" data-reaction-controls="true">
                                <button
                                  type="button"
                                  aria-label="React to message"
                                  aria-expanded={isPickerOpen}
                                  onClick={() =>
                                    setActiveReactionPickerMessageId((curr) =>
                                      curr === msg.id ? null : msg.id
                                    )
                                  }
                                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-[#526D5C] hover:text-[#0F291A] hover:bg-[#E4EFE8] transition-opacity ${
                                    isPickerOpen
                                      ? 'opacity-100 bg-[#E4EFE8] text-[#0F291A]'
                                      : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
                                  }`}
                                >
                                  <SmilePlus className="w-4 h-4" />
                                </button>

                                {isPickerOpen && (
                                  <div
                                    role="menu"
                                    aria-label="Choose an emoji reaction"
                                    className={`absolute bottom-full mb-1.5 z-20 flex items-center gap-1 p-1 bg-white border border-[#CFE0D5] rounded-xl shadow-md ${
                                      isMine ? 'right-0' : 'left-0'
                                    }`}
                                  >
                                    {REACTION_EMOJIS.map((emoji) => {
                                      const alreadyMine = (msg.reactions ?? []).some(
                                        (r) => r.user_id === user.uid && r.emoji === emoji
                                      );
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          role="menuitem"
                                          aria-label={`React with ${emoji}`}
                                          onClick={() => void handleToggleReaction(msg, emoji)}
                                          className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                                            alreadyMine
                                              ? 'bg-[#DCFCE7] ring-1 ring-[#16A34A]'
                                              : 'hover:bg-[#EEF4F0]'
                                          }`}
                                        >
                                          {emoji}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {groupedReactions.length > 0 && (
                          <div
                            className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${
                              isMine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {groupedReactions.map((reaction) => (
                              <button
                                key={reaction.emoji}
                                type="button"
                                onClick={() => void handleToggleReaction(msg, reaction.emoji)}
                                aria-pressed={reaction.reactedByMe}
                                aria-label={`${reaction.emoji} ${reaction.count} reaction${
                                  reaction.count === 1 ? '' : 's'
                                }`}
                                className={`min-h-[26px] px-2 py-0.5 rounded-lg border text-xs inline-flex items-center gap-1 transition-colors ${
                                  reaction.reactedByMe
                                    ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#14532D] font-semibold'
                                    : 'bg-white border-[#D4E3D9] text-[#1F3A2A] hover:bg-[#EEF4F0]'
                                }`}
                              >
                                <span>{reaction.emoji}</span>
                                <span className="font-mono text-[11px] tabular-nums">
                                  {reaction.count}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              {otherUserTyping && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2.5 justify-start pt-1"
                >
                  <div
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-bl-sm bg-white border border-[#D8E5DC] ${textSizeConfig.metaClass} text-[#4B6856]`}
                  >
                    <span className="inline-flex items-center gap-1" aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] motion-safe:animate-bounce [animation-delay:-0.24s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] motion-safe:animate-bounce [animation-delay:-0.12s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] motion-safe:animate-bounce" />
                    </span>
                    <span>{activeConversation.other_user.display_name} is typing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Text & Sticker Message Composer */}
            <form
              onSubmit={handleSendSubmit}
              className="relative px-4 md:px-6 py-3 bg-white/95 backdrop-blur-xs border-t border-[#DCE8E0] flex items-end gap-2.5 shrink-0"
            >
              <div className="relative" data-sticker-controls="true">
                <button
                  type="button"
                  disabled={!isBackendConfigured || sending}
                  onClick={() => setStickerPickerOpen((prev) => !prev)}
                  aria-label="Send a sticker"
                  aria-expanded={stickerPickerOpen}
                  title="Stickers"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-colors ${
                    stickerPickerOpen
                      ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#14532D]'
                      : 'bg-[#F5F9F6] border-[#CFE0D5] text-[#375242] hover:bg-[#E7F0EA] hover:text-[#0F291A]'
                  } disabled:opacity-45`}
                >
                  <Sticker className="w-4.5 h-4.5" />
                </button>

                {stickerPickerOpen && (
                  <div
                    role="dialog"
                    aria-label="Choose a sticker"
                    className="absolute bottom-full left-0 mb-2 z-30 w-[296px] sm:w-[328px] bg-white border border-[#CFE0D5] rounded-2xl shadow-lg p-3"
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EEF4F0]">
                      <span className="text-xs font-semibold text-[#0F291A]">
                        vonChat Stickers
                      </span>
                      <button
                        type="button"
                        onClick={() => setStickerPickerOpen(false)}
                        aria-label="Close sticker picker"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#547260] hover:text-[#0F291A] hover:bg-[#EEF4F0]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {VONCHAT_STICKERS.map((sticker) => (
                        <button
                          key={sticker.id}
                          type="button"
                          onClick={() => void sendSticker(sticker)}
                          className="p-1.5 rounded-xl hover:bg-[#EEF4F0] flex flex-col items-center gap-1 transition-colors text-center"
                        >
                          <StickerArt stickerId={sticker.id} className="w-12 h-12" />
                          <span className="text-[10px] font-medium text-[#1F3A2A] truncate w-full">
                            {sticker.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <textarea
                ref={composerRef}
                rows={1}
                value={draft}
                onChange={(e) => handleComposerChange(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={`Message ${activeConversation.other_user.display_name}...`}
                aria-label="Message text"
                className={`flex-1 min-h-[44px] max-h-[140px] resize-none px-4 py-2.5 ${textSizeConfig.composerClass} bg-[#F5F9F6] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]`}
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
        currentWallpaperId={wallpaperId}
        onWallpaperChange={setWallpaperId}
        currentTextSize={chatTextSize}
        onTextSizeChange={setChatTextSize}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={onProfileUpdated}
      />

      <StatusComposerModal
        isOpen={statusComposerOpen}
        userId={user.uid}
        authorName={myDisplayName}
        authorAvatarColor={profile?.avatar_color || '#166534'}
        visibleToUids={visibleToContactUids}
        onClose={() => setStatusComposerOpen(false)}
        onStatusCreated={handleStatusCreated}
      />

      <StatusViewerModal
        isOpen={Boolean(viewerAuthorId && activeViewerStatuses.length > 0)}
        authorStatuses={activeViewerStatuses}
        currentUid={user.uid}
        currentDisplayName={myDisplayName}
        currentAvatarColor={profile?.avatar_color || '#166534'}
        onClose={() => setViewerAuthorId(null)}
        onViewedStatus={handleMarkStatusViewedLocal}
        onDeletedStatus={handleStatusDeleted}
      />
    </div>
  );
}
