import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth, onIdTokenChanged, type User } from './lib/firebase';
import { isSupabaseConfigured, syncSupabaseRealtimeAuth } from './lib/supabase';
import {
  formatSupabaseError,
  setPresenceStatus,
  upsertUserProfile,
} from './lib/chatService';
import type { Profile } from './types/chat';
import { AuthView } from './components/AuthView';
import { ChatWorkspace } from './components/ChatWorkspace';
import { VonChatLogo } from './components/VonChatLogo';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setProfile(null);
        setProfileSyncError(null);
        if (isSupabaseConfigured) {
          void syncSupabaseRealtimeAuth();
        }
        return;
      }

      if (!isSupabaseConfigured) {
        return;
      }

      try {
        setProfileSyncError(null);
        await syncSupabaseRealtimeAuth();
        const syncedProfile = await upsertUserProfile(nextUser);
        setProfile(syncedProfile);
      } catch (err) {
        setProfileSyncError(formatSupabaseError(err));
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      return;
    }

    const handleVisibilityChange = () => {
      const online = document.visibilityState === 'visible';
      void setPresenceStatus(user.uid, online);
      setProfile((prev) => (prev ? { ...prev, is_online: online } : prev));
    };

    const handleBeforeUnload = () => {
      void setPresenceStatus(user.uid, false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F4F8F5] flex flex-col items-center justify-center gap-4">
        <VonChatLogo size="md" tone="light" />
        <div className="flex items-center gap-2 text-sm text-[#4B6856]">
          <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
          <span>Loading your session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <ChatWorkspace
      user={user}
      profile={profile}
      profileSyncError={profileSyncError}
      onProfileUpdated={setProfile}
    />
  );
}
