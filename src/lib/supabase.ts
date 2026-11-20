import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { auth } from './firebase';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const isSupabaseConfigured =
  supabaseUrl.length > 0 &&
  supabaseAnonKey.length > 0 &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnonKey.includes('your-supabase-anon-key');

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }
      return await currentUser.getIdToken();
    },
  });
}

export const supabase = client;

export async function syncSupabaseRealtimeAuth(): Promise<void> {
  if (!client) {
    return;
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    await client.realtime.setAuth(null);
    return;
  }
  const token = await currentUser.getIdToken();
  await client.realtime.setAuth(token);
}
