import { useEffect, useState, type FormEvent } from 'react';
import { X, AlertCircle, Check, LogOut } from 'lucide-react';
import { auth, updateProfile, signOut } from '../lib/firebase';
import {
  formatSupabaseError,
  setPresenceStatus,
  updateUserProfile,
} from '../lib/chatService';
import type { Profile } from '../types/chat';

interface ProfileModalProps {
  isOpen: boolean;
  profile: Profile | null;
  email: string;
  onClose: () => void;
  onProfileUpdated: (updated: Profile) => void;
}

export function ProfileModal({
  isOpen,
  profile,
  email,
  onClose,
  onProfileUpdated,
}: ProfileModalProps) {
  const [nameInput, setNameInput] = useState(profile?.display_name ?? '');
  const [statusMessage, setStatusMessage] = useState(profile?.status_message ?? '');
  const [isOnline, setIsOnline] = useState<boolean>(profile?.is_online ?? true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNameInput(profile?.display_name ?? email.split('@')[0] ?? '');
      setStatusMessage(profile?.status_message ?? '');
      setIsOnline(profile?.is_online ?? true);
      setSavedSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, profile, email]);

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
        await updateProfile(auth.currentUser, { displayName: trimmedName });
        const updated = await updateUserProfile(auth.currentUser.uid, {
          display_name: trimmedName,
          status_message: statusMessage.trim(),
          is_online: isOnline,
        });
        onProfileUpdated(updated);
        setSavedSuccess(true);
      }
    } catch (err) {
      setErrorMessage(formatSupabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (auth.currentUser) {
      await setPresenceStatus(auth.currentUser.uid, false);
    }
    await signOut(auth);
    onClose();
  };

  const initials = (nameInput.trim() || email || 'VC').slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091E12]/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-[#D4E3D9] rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E3EDE6]">
          <h2 id="profile-modal-title" className="text-base font-semibold text-[#0F291A]">
            Your profile &amp; status
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

        <div className="p-5 space-y-5">
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
              <span>Profile and status updated.</span>
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
