import { useEffect, useState, type FormEvent } from 'react';
import { X, AlertCircle, Check, LogOut } from 'lucide-react';
import { auth, updateProfile, signOut } from '../lib/firebase';
import {
  formatSupabaseError,
  isBackendConfigured,
  setPresenceStatus,
  updateUserProfile,
} from '../lib/chatService';
import {
  CHAT_WALLPAPERS,
  DEFAULT_WALLPAPER_ID,
  getStoredWallpaperId,
  setStoredWallpaperId,
} from '../data/wallpapers';
import {
  CHAT_TEXT_SIZE_OPTIONS,
  DEFAULT_CHAT_TEXT_SIZE,
  getChatTextSizeConfig,
  getStoredChatTextSize,
  setStoredChatTextSize,
  type ChatTextSize,
} from '../data/accessibility';
import type { Profile } from '../types/chat';

interface ProfileModalProps {
  isOpen: boolean;
  profile: Profile | null;
  email: string;
  currentWallpaperId?: string;
  onWallpaperChange?: (wallpaperId: string) => void;
  currentTextSize?: ChatTextSize;
  onTextSizeChange?: (size: ChatTextSize) => void;
  onClose: () => void;
  onProfileUpdated: (updated: Profile) => void;
}

export function ProfileModal({
  isOpen,
  profile,
  email,
  currentWallpaperId,
  onWallpaperChange,
  currentTextSize,
  onTextSizeChange,
  onClose,
  onProfileUpdated,
}: ProfileModalProps) {
  const [nameInput, setNameInput] = useState(profile?.display_name ?? '');
  const [statusMessage, setStatusMessage] = useState(profile?.status_message ?? '');
  const [bioInput, setBioInput] = useState(profile?.bio ?? '');
  const [isOnline, setIsOnline] = useState<boolean>(profile?.is_online ?? true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<string>(
    profile?.chat_wallpaper ?? currentWallpaperId ?? DEFAULT_WALLPAPER_ID
  );
  const [selectedTextSize, setSelectedTextSize] = useState<ChatTextSize>(
    currentTextSize ?? DEFAULT_CHAT_TEXT_SIZE
  );
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const uid = auth.currentUser?.uid ?? profile?.id ?? '';
      setNameInput(profile?.display_name ?? email.split('@')[0] ?? '');
      setStatusMessage(profile?.status_message ?? '');
      setBioInput(profile?.bio ?? '');
      setIsOnline(profile?.is_online ?? true);
      setSelectedWallpaper(
        profile?.chat_wallpaper ??
          currentWallpaperId ??
          (uid ? getStoredWallpaperId(uid) : null) ??
          DEFAULT_WALLPAPER_ID
      );
      setSelectedTextSize(
        currentTextSize ?? (uid ? getStoredChatTextSize(uid) : DEFAULT_CHAT_TEXT_SIZE)
      );
      setSavedSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, profile, email, currentWallpaperId, currentTextSize]);

  if (!isOpen) {
    return null;
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSavedSuccess(false);
    try {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        await updateProfile(auth.currentUser, { displayName: trimmedName });
        setStoredWallpaperId(uid, selectedWallpaper);
        onWallpaperChange?.(selectedWallpaper);
        setStoredChatTextSize(uid, selectedTextSize);
        onTextSizeChange?.(selectedTextSize);

        if (isBackendConfigured) {
          const updated = await updateUserProfile(uid, {
            display_name: trimmedName,
            status_message: statusMessage.trim(),
            bio: bioInput.trim(),
            is_online: isOnline,
            chat_wallpaper: selectedWallpaper,
          });
          onProfileUpdated(updated);
        }
        setSavedSuccess(true);
      }
    } catch (err) {
      setErrorMessage(formatSupabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (auth.currentUser && isBackendConfigured) {
      await setPresenceStatus(auth.currentUser.uid, false);
    }
    await signOut(auth);
    onClose();
  };

  const handleTextSizeSelect = (size: ChatTextSize) => {
    setSelectedTextSize(size);
    const uid = auth.currentUser?.uid ?? profile?.id ?? '';
    if (uid) {
      setStoredChatTextSize(uid, size);
    }
    onTextSizeChange?.(size);
  };

  const activeTextSizeConfig = getChatTextSizeConfig(selectedTextSize);
  const initials = (nameInput.trim() || email || 'VC').slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091E12]/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white border border-[#D4E3D9] rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EDE6] shrink-0">
          <h2 id="profile-modal-title" className="text-base font-semibold text-[#0F291A]">
            Your profile &amp; settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile modal"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#547260] hover:text-[#0F291A] hover:bg-[#EEF4F0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
              style={{ backgroundColor: profile?.avatar_color || '#166534' }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold text-[#0F291A] truncate">
                  {profile?.display_name || nameInput}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-[#16A34A]' : 'bg-[#9DB3A5]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className={isOnline ? 'text-[#15803D] font-medium' : 'text-[#63806F]'}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-[#547260] truncate">{email}</p>
              {profile?.bio ? (
                <p className="mt-1 text-xs text-[#2E4B3A] leading-snug line-clamp-2 break-words">
                  {profile.bio}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-[#7B9685] italic">
                  No bio added yet
                </p>
              )}
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Profile and display settings updated.</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label
                htmlFor="profile-display-name"
                className="block text-sm font-medium text-[#1F3A2A] mb-1.5"
              >
                Display name
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                maxLength={60}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#F6FAF7] border border-[#CFE0D5] rounded-xl text-[#112419] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-[#1F3A2A] mb-1.5">
                Availability
              </span>
              <div
                className="grid grid-cols-2 gap-1 p-1 bg-[#EEF4F0] rounded-xl"
                role="radiogroup"
                aria-label="Online availability"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isOnline}
                  onClick={() => setIsOnline(true)}
                  className={`min-h-[38px] text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    isOnline
                      ? 'bg-white text-[#0F291A] shadow-xs'
                      : 'text-[#4B6856] hover:text-[#0F291A]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" aria-hidden="true" />
                  <span>Online</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isOnline}
                  onClick={() => setIsOnline(false)}
                  className={`min-h-[38px] text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    !isOnline
                      ? 'bg-white text-[#0F291A] shadow-xs'
                      : 'text-[#4B6856] hover:text-[#0F291A]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9DB3A5]" aria-hidden="true" />
                  <span>Offline</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profile-status-message"
                  className="block text-sm font-medium text-[#1F3A2A]"
                >
                  Custom status message
                </label>
                {statusMessage && (
                  <button
                    type="button"
                    onClick={() => setStatusMessage('')}
                    className="text-xs text-[#547260] hover:text-[#0F291A]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                id="profile-status-message"
                type="text"
                maxLength={120}
                placeholder="e.g. Focusing, At lunch, Open to chat"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-[#F6FAF7] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profile-bio"
                  className="block text-sm font-medium text-[#1F3A2A]"
                >
                  Short bio
                </label>
                <div className="flex items-center gap-2.5">
                  {bioInput && (
                    <button
                      type="button"
                      onClick={() => setBioInput('')}
                      className="text-xs text-[#547260] hover:text-[#0F291A]"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-[11px] font-mono tabular-nums text-[#63806F]">
                    {bioInput.length}/240
                  </span>
                </div>
              </div>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={240}
                placeholder="Share a short note about yourself, your work, or interests..."
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#F6FAF7] border border-[#CFE0D5] rounded-xl text-[#112419] placeholder:text-[#7B9685] focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D] resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="block text-sm font-medium text-[#1F3A2A]">
                  Chat wallpaper
                </span>
                <span className="text-xs text-[#547260]">
                  Nature themes
                </span>
              </div>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Chat wallpaper theme"
              >
                {CHAT_WALLPAPERS.map((theme) => {
                  const isSelected = selectedWallpaper === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedWallpaper(theme.id)}
                      className={`group text-left rounded-xl border p-2 transition-all ${
                        isSelected
                          ? 'border-[#15803D] ring-2 ring-[#15803D]/20 bg-[#F2FBF5]'
                          : 'border-[#D4E3D9] bg-white hover:border-[#A9C5B3] hover:bg-[#F8FBF9]'
                      }`}
                    >
                      <div
                        className="relative h-12 w-full rounded-lg border border-[#DCE8E0] overflow-hidden mb-1.5"
                        style={theme.style}
                      >
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#15803D] text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[#0F291A] truncate">
                        {theme.name}
                      </p>
                      <p className="text-[11px] text-[#547260] truncate">
                        {theme.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span id="chat-text-size-label" className="block text-sm font-medium text-[#1F3A2A]">
                  Chat text size
                </span>
                <span className="text-xs text-[#547260]">
                  Accessibility
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1 p-1 bg-[#EEF4F0] rounded-xl"
                role="radiogroup"
                aria-labelledby="chat-text-size-label"
              >
                {CHAT_TEXT_SIZE_OPTIONS.map((option) => {
                  const isSelected = selectedTextSize === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleTextSizeSelect(option.id)}
                      className={`min-h-[40px] px-2 py-1.5 rounded-lg transition-colors flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-white text-[#0F291A] shadow-xs ring-1 ring-[#C5DACD]'
                          : 'text-[#4B6856] hover:text-[#0F291A]'
                      }`}
                    >
                      <span className="text-xs font-semibold leading-tight">
                        {option.label}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-[#63806F]">
                        {option.scaleNote}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 p-3 rounded-xl border border-[#DCE8E0] bg-[#F6FAF7]">
                <p className="text-[11px] font-medium text-[#547260] mb-1.5">
                  Message preview
                </p>
                <div className="flex justify-end">
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-[#166534] text-white ${activeTextSizeConfig.messageClass}`}
                  >
                    Wishing you a calm, focused afternoon in vonChat.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#EEF4F0]">
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#D4E3D9] text-sm font-medium text-[#375242] hover:bg-[#F3F8F5] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
