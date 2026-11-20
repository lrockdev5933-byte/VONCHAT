import { useEffect, useState, type FormEvent } from 'react';
import { Search, X, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import {
  activeBackend,
  findUsersByEmail,
  findOrCreateConversation,
  formatSupabaseError,
} from '../lib/chatService';
import type { Profile } from '../types/chat';

interface NewChatModalProps {
  isOpen: boolean;
  currentUid: string;
  onClose: () => void;
  onConversationOpened: (conversationId: string) => void;
}

export function NewChatModal({
  isOpen,
  currentUid,
  onClose,
  onConversationOpened,
}: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setErrorMessage(null);
      setStartingUserId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setErrorMessage(null);
      return;
    }

    if (activeBackend === 'firebase' && (!trimmed.includes('@') || !trimmed.includes('.'))) {
      setResults([]);
      setHasSearched(false);
      setErrorMessage(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      setErrorMessage(null);
      try {
        const users = await findUsersByEmail(trimmed, currentUid);
        setResults(users);
        setHasSearched(true);
      } catch (err) {
        setErrorMessage(formatSupabaseError(err));
      } finally {
        setSearching(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [query, isOpen, currentUid]);

  if (!isOpen) {
    return null;
  }

  const handleManualSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setErrorMessage(null);
    try {
      const users = await findUsersByEmail(trimmed, currentUid);
      setResults(users);
      setHasSearched(true);
    } catch (err) {
      setErrorMessage(formatSupabaseError(err));
    } finally {
      setSearching(false);
    }
  };

  const handleStartChat = async (targetUser: Profile) => {
    setStartingUserId(targetUser.id);
    setErrorMessage(null);
    try {
      const conversationId = await findOrCreateConversation(
        targetUser.id,
        currentUid,
        targetUser
      );
      onConversationOpened(conversationId);
      onClose();
    } catch (err) {
      setErrorMessage(formatSupabaseError(err));
      setStartingUserId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091E12]/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-title"
    >
      <div className="w-full max-w-md bg-white border border-[#D4E3D9] rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EDE6]">
          <div>
            <h2 id="new-chat-title" className="text-base font-semibold text-[#0F291A]">
              New conversation
            </h2>
            <p className="text-xs text-[#547260]">
              Find another vonChat user by their email address.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new conversation dialog"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#547260] hover:text-[#0F291A] hover:bg-[#EEF4F0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <form onSubmit={handleManualSearch} className="relative">
            <Search className="w-4 h-4 text-[#63806F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email (e.g. alex@example.com)"
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm bg-[#F6FAF7] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
            />
          </form>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="min-h-[160px] max-h-[280px] overflow-y-auto divide-y divide-[#EEF4F0]">
            {searching && (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-[#547260]">
                <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
                <span>Searching directory...</span>
              </div>
            )}

            {!searching && !hasSearched && (
              <div className="py-10 text-center text-sm text-[#63806F]">
                {activeBackend === 'firebase'
                  ? 'Enter their full email address above to look up a registered member.'
                  : 'Type an email address above to look up a registered member.'}
              </div>
            )}

            {!searching && hasSearched && results.length === 0 && (
              <div className="py-10 text-center space-y-1">
                <p className="text-sm font-medium text-[#1F3A2A]">No matching user found</p>
                <p className="text-xs text-[#63806F]">
                  Ask them to sign in to vonChat with their email first.
                </p>
              </div>
            )}

            {!searching &&
              results.map((person) => {
                const initials = person.display_name.slice(0, 2).toUpperCase();
                const isStarting = startingUserId === person.id;
                return (
                  <div
                    key={person.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                        style={{ backgroundColor: person.avatar_color || '#166534' }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold text-[#0F291A] truncate">
                            {person.display_name}
                          </p>
                          <span className="inline-flex items-center gap-1 text-xs shrink-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                person.is_online ? 'bg-[#16A34A]' : 'bg-[#9DB3A5]'
                              }`}
                              aria-hidden="true"
                            />
                            <span
                              className={
                                person.is_online ? 'text-[#15803D] font-medium' : 'text-[#63806F]'
                              }
                            >
                              {person.is_online ? 'Online' : 'Offline'}
                            </span>
                          </span>
                        </div>
                        <p className="text-xs text-[#547260] truncate">
                          {person.status_message
                            ? `${person.status_message} · ${person.email}`
                            : person.email}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isStarting || startingUserId !== null}
                      onClick={() => handleStartChat(person)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {isStarting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>{isStarting ? 'Opening...' : 'Message'}</span>
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
