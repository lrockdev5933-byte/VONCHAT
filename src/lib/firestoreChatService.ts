import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  type User,
} from './firebase';
import { DEFAULT_WALLPAPER_ID } from '../data/wallpapers';
import type {
  ConversationListItem,
  Message,
  MessageReaction,
  MessageSearchResult,
  Profile,
  StatusItem,
  StatusMediaType,
  StatusViewRecord,
} from '../types/chat';

const CALM_AVATAR_COLORS = [
  '#166534',
  '#15803D',
  '#0F766E',
  '#047857',
  '#3F6212',
  '#1E6B4B',
];

const DISPLAY_NAME_MAX = 60;
const STATUS_MESSAGE_MAX = 120;
const BIO_MAX = 240;
const CHAT_WALLPAPER_MAX = 40;
const MESSAGE_CONTENT_MAX = 4000;
const PREVIEW_MAX = 500;

function pickAvatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return CALM_AVATAR_COLORS[hash % CALM_AVATAR_COLORS.length];
}

function sanitizeDisplayName(raw: string | null | undefined, fallback: string): string {
  const clean = (raw ?? '').trim().slice(0, DISPLAY_NAME_MAX);
  return clean || fallback.slice(0, DISPLAY_NAME_MAX) || 'vonChat member';
}

function sanitizeStatusMessage(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, STATUS_MESSAGE_MAX);
}

function sanitizeBio(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, BIO_MAX);
}

function sanitizeWallpaper(raw: string | null | undefined): string {
  const clean = (raw ?? '').trim().slice(0, CHAT_WALLPAPER_MAX);
  return /^[a-z0-9_]+$/.test(clean) ? clean : DEFAULT_WALLPAPER_ID;
}

function toIsoString(ts: unknown, fallbackIso?: string): string {
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as Timestamp).toDate === 'function') {
    return (ts as Timestamp).toDate().toISOString();
  }
  if (typeof ts === 'string' && ts.length > 0) {
    return ts;
  }
  return fallbackIso ?? new Date().toISOString();
}

async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function emojiToHex(emoji: string): string {
  return Array.from(emoji)
    .map((ch) => (ch.codePointAt(0) ?? 0).toString(16))
    .join('-');
}

function sortParticipants(uid1: string, uid2: string): [string, string] {
  return uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
}

export function buildConversationId(uid1: string, uid2: string): string {
  const [a, b] = sortParticipants(uid1, uid2);
  return `${a}_${b}`;
}

export function formatFirestoreErrorForUser(error: unknown): string {
  if (error instanceof Error && error.message) {
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission')) {
          return 'Permission denied while accessing Firestore. Ensure you are signed in and rules are deployed.';
        }
        return parsed.error;
      }
    } catch {
      return error.message;
    }
  }
  return 'An unexpected Firebase error occurred.';
}

function mapUserDocToProfile(data: Record<string, unknown>, id: string): Profile {
  const nowIso = new Date().toISOString();
  return {
    id,
    email: typeof data.email === 'string' ? data.email : '',
    display_name: typeof data.display_name === 'string' ? data.display_name : 'vonChat member',
    avatar_color: typeof data.avatar_color === 'string' ? data.avatar_color : pickAvatarColor(id),
    is_online: Boolean(data.is_online),
    status_message: typeof data.status_message === 'string' ? data.status_message : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    chat_wallpaper: typeof data.chat_wallpaper === 'string' ? data.chat_wallpaper : DEFAULT_WALLPAPER_ID,
    last_seen_at: typeof data.last_seen_at === 'string' ? data.last_seen_at : nowIso,
    created_at: toIsoString(data.createdAt, nowIso),
    updated_at: toIsoString(data.updatedAt, nowIso),
  };
}

export async function upsertUserProfile(user: User, preferredName?: string): Promise<Profile> {
  const normalizedEmail = (user.email ?? '').trim().toLowerCase() || `${user.uid}@vonchat.local`;
  const fallbackName = normalizedEmail.split('@')[0] || 'vonChat member';
  const nowIso = new Date().toISOString();
  const userPath = `users/${user.uid}`;
  const presencePath = `presence/${user.uid}`;

  const userRef = doc(db, 'users', user.uid);
  const presenceRef = doc(db, 'presence', user.uid);

  let existingUserData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingUserData = snap.data() as Record<string, unknown>;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const avatarColor =
    typeof existingUserData?.avatar_color === 'string'
      ? existingUserData.avatar_color
      : pickAvatarColor(user.uid);
  const displayName = sanitizeDisplayName(
    preferredName ?? (existingUserData?.display_name as string | undefined) ?? user.displayName,
    fallbackName
  );
  const statusMessage = sanitizeStatusMessage(
    existingUserData?.status_message as string | undefined
  );
  const bio = sanitizeBio(existingUserData?.bio as string | undefined);
  const chatWallpaper = sanitizeWallpaper(
    existingUserData?.chat_wallpaper as string | undefined
  );

  if (existingUserData) {
    try {
      const existingUpdate: Record<string, unknown> = {
        display_name: displayName,
        is_online: true,
        last_seen_at: nowIso,
        updatedAt: serverTimestamp(),
      };
      if (typeof existingUserData.bio !== 'string') {
        existingUpdate.bio = bio;
      }
      await updateDoc(userRef, existingUpdate);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  } else {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: normalizedEmail.slice(0, 254),
        display_name: displayName,
        avatar_color: avatarColor,
        is_online: true,
        status_message: '',
        bio: '',
        chat_wallpaper: DEFAULT_WALLPAPER_ID,
        last_seen_at: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }

  let presenceExists = false;
  try {
    const pSnap = await getDoc(presenceRef);
    presenceExists = pSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, presencePath);
  }

  if (presenceExists) {
    try {
      await updateDoc(presenceRef, {
        display_name: displayName,
        avatar_color: avatarColor,
        is_online: true,
        status_message: statusMessage,
        bio,
        last_seen_at: nowIso,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, presencePath);
    }
  } else {
    try {
      await setDoc(presenceRef, {
        uid: user.uid,
        display_name: displayName,
        avatar_color: avatarColor,
        is_online: true,
        status_message: statusMessage,
        bio,
        last_seen_at: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, presencePath);
    }
  }

  if (user.email) {
    const emailHash = await hashEmail(user.email);
    const dirPath = `email_directory/${emailHash}`;
    const dirRef = doc(db, 'email_directory', emailHash);
    let dirExists = false;
    try {
      const dSnap = await getDoc(dirRef);
      dirExists = dSnap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, dirPath);
    }

    if (dirExists) {
      try {
        await updateDoc(dirRef, {
          display_name: displayName,
          avatar_color: avatarColor,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, dirPath);
      }
    } else {
      try {
        await setDoc(dirRef, {
          uid: user.uid,
          display_name: displayName,
          avatar_color: avatarColor,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, dirPath);
      }
    }
  }

  try {
    const refreshed = await getDoc(userRef);
    return mapUserDocToProfile((refreshed.data() ?? {}) as Record<string, unknown>, user.uid);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: {
    display_name?: string;
    status_message?: string;
    bio?: string;
    is_online?: boolean;
    chat_wallpaper?: string;
  }
): Promise<Profile> {
  const userPath = `users/${uid}`;
  const presencePath = `presence/${uid}`;
  const userRef = doc(db, 'users', uid);
  const presenceRef = doc(db, 'presence', uid);
  const nowIso = new Date().toISOString();

  const userUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const presenceUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.display_name !== undefined) {
    const trimmed = updates.display_name.trim().slice(0, DISPLAY_NAME_MAX);
    if (!trimmed) {
      throw new Error('Display name cannot be empty.');
    }
    userUpdates.display_name = trimmed;
    presenceUpdates.display_name = trimmed;
  }

  if (updates.status_message !== undefined) {
    const cleanStatus = sanitizeStatusMessage(updates.status_message);
    userUpdates.status_message = cleanStatus;
    presenceUpdates.status_message = cleanStatus;
  }

  if (updates.bio !== undefined) {
    const cleanBio = sanitizeBio(updates.bio);
    userUpdates.bio = cleanBio;
    presenceUpdates.bio = cleanBio;
  }

  if (updates.is_online !== undefined) {
    userUpdates.is_online = updates.is_online;
    userUpdates.last_seen_at = nowIso;
    presenceUpdates.is_online = updates.is_online;
    presenceUpdates.last_seen_at = nowIso;
  }

  if (updates.chat_wallpaper !== undefined) {
    userUpdates.chat_wallpaper = sanitizeWallpaper(updates.chat_wallpaper);
  }

  try {
    await updateDoc(userRef, userUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  try {
    await updateDoc(presenceRef, presenceUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, presencePath);
  }

  try {
    const snap = await getDoc(userRef);
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const profile = mapUserDocToProfile(data, uid);

    if (updates.display_name !== undefined && profile.email) {
      const emailHash = await hashEmail(profile.email);
      const dirRef = doc(db, 'email_directory', emailHash);
      await updateDoc(dirRef, {
        display_name: profile.display_name,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function setPresenceStatus(uid: string, isOnline: boolean): Promise<void> {
  const nowIso = new Date().toISOString();
  const userRef = doc(db, 'users', uid);
  const presenceRef = doc(db, 'presence', uid);
  try {
    await Promise.all([
      updateDoc(userRef, {
        is_online: isOnline,
        last_seen_at: nowIso,
        updatedAt: serverTimestamp(),
      }),
      updateDoc(presenceRef, {
        is_online: isOnline,
        last_seen_at: nowIso,
        updatedAt: serverTimestamp(),
      }),
    ]);
  } catch {
    // Best-effort on visibilitychange / beforeunload
  }
}

export async function findUsersByEmail(queryStr: string, currentUid: string): Promise<Profile[]> {
  const trimmed = queryStr.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
    return [];
  }

  const emailHash = await hashEmail(trimmed);
  const dirPath = `email_directory/${emailHash}`;
  let entryData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(db, 'email_directory', emailHash));
    if (!snap.exists()) {
      return [];
    }
    entryData = snap.data() as Record<string, unknown>;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, dirPath);
  }

  const targetUid = typeof entryData?.uid === 'string' ? entryData.uid : '';
  if (!targetUid || targetUid === currentUid) {
    return [];
  }

  const presencePath = `presence/${targetUid}`;
  try {
    const presenceSnap = await getDoc(doc(db, 'presence', targetUid));
    const pData = presenceSnap.exists()
      ? (presenceSnap.data() as Record<string, unknown>)
      : entryData;
    const profile = mapUserDocToProfile(pData ?? {}, targetUid);
    return [{ ...profile, email: trimmed }];
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, presencePath);
  }
}

export async function findOrCreateConversation(
  targetUserId: string,
  currentUid: string,
  targetProfile?: Profile
): Promise<string> {
  if (!currentUid) {
    throw new Error('You must be signed in to start a conversation.');
  }
  if (targetUserId === currentUid) {
    throw new Error('You cannot start a conversation with yourself.');
  }

  const [participantA, participantB] = sortParticipants(currentUid, targetUserId);
  const conversationId = `${participantA}_${participantB}`;
  const convPath = `conversations/${conversationId}`;
  const convRef = doc(db, 'conversations', conversationId);
  const nowIso = new Date().toISOString();

  let exists = false;
  try {
    const snap = await getDoc(convRef);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, convPath);
  }

  if (!exists) {
    try {
      await setDoc(convRef, {
        id: conversationId,
        participantA,
        participantB,
        created_by: currentUid,
        last_message_preview: '',
        last_message_at: nowIso,
        last_sender_id: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, convPath);
    }
  }

  const participantPath = `conversations/${conversationId}/participants/${currentUid}`;
  const participantRef = doc(db, 'conversations', conversationId, 'participants', currentUid);
  let participantExists = false;
  try {
    const pSnap = await getDoc(participantRef);
    participantExists = pSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, participantPath);
  }

  if (!participantExists) {
    try {
      await setDoc(participantRef, {
        uid: currentUid,
        conversation_id: conversationId,
        last_read_at: nowIso,
        is_typing: false,
        typing_updated_at: nowIso,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, participantPath);
    }
  }

  if (targetProfile?.email) {
    const contactPath = `users/${currentUid}/contacts/${targetUserId}`;
    const contactRef = doc(db, 'users', currentUid, 'contacts', targetUserId);
    try {
      const existingContact = await getDoc(contactRef);
      if (existingContact.exists()) {
        await updateDoc(contactRef, {
          email: targetProfile.email.trim().toLowerCase().slice(0, 254),
          display_name: sanitizeDisplayName(targetProfile.display_name, 'vonChat member'),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(contactRef, {
          uid: targetUserId,
          email: targetProfile.email.trim().toLowerCase().slice(0, 254),
          display_name: sanitizeDisplayName(targetProfile.display_name, 'vonChat member'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, contactPath);
    }
  }

  return conversationId;
}

export async function fetchConversations(currentUid: string): Promise<ConversationListItem[]> {
  const convCollection = collection(db, 'conversations');

  const [snapA, snapB, contactsSnap] = await Promise.all([
    getDocs(query(convCollection, where('participantA', '==', currentUid))).catch((error) =>
      handleFirestoreError(error, OperationType.LIST, 'conversations')
    ),
    getDocs(query(convCollection, where('participantB', '==', currentUid))).catch((error) =>
      handleFirestoreError(error, OperationType.LIST, 'conversations')
    ),
    getDocs(collection(db, 'users', currentUid, 'contacts')).catch(() => null),
  ]);

  const knownEmails = new Map<string, string>();
  if (contactsSnap) {
    contactsSnap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      if (typeof data.email === 'string') {
        knownEmails.set(docSnap.id, data.email);
      }
    });
  }

  const convDocsMap = new Map<string, Record<string, unknown>>();
  snapA.forEach((d) => convDocsMap.set(d.id, d.data() as Record<string, unknown>));
  snapB.forEach((d) => convDocsMap.set(d.id, d.data() as Record<string, unknown>));

  const items = await Promise.all(
    Array.from(convDocsMap.entries()).map(async ([convId, data]) => {
      const participantA = String(data.participantA ?? '');
      const participantB = String(data.participantB ?? '');
      const otherUid = participantA === currentUid ? participantB : participantA;
      const myRoleField = participantA === currentUid ? 'participantA' : 'participantB';

      const [presenceSnap, participantSnap, messagesSnap] = await Promise.all([
        getDoc(doc(db, 'presence', otherUid)).catch((error) =>
          handleFirestoreError(error, OperationType.GET, `presence/${otherUid}`)
        ),
        getDoc(doc(db, 'conversations', convId, 'participants', currentUid)).catch(() => null),
        getDocs(
          query(
            collection(db, 'conversations', convId, 'messages'),
            where(myRoleField, '==', currentUid)
          )
        ).catch(() => null),
      ]);

      const otherProfile = presenceSnap.exists()
        ? mapUserDocToProfile(presenceSnap.data() as Record<string, unknown>, otherUid)
        : mapUserDocToProfile({}, otherUid);
      const savedEmail = knownEmails.get(otherUid);
      if (savedEmail) {
        otherProfile.email = savedEmail;
      }

      const participantData =
        participantSnap && participantSnap.exists()
          ? (participantSnap.data() as Record<string, unknown>)
          : null;
      const lastReadAt = participantData ? String(participantData.last_read_at ?? '') : '';
      const archived = participantData ? Boolean(participantData.archived) : false;

      let unreadCount = 0;
      if (messagesSnap) {
        messagesSnap.forEach((mDoc) => {
          const m = mDoc.data() as Record<string, unknown>;
          const senderId = String(m.sender_id ?? '');
          const createdIso = String(m.created_at_iso ?? '');
          if (senderId !== currentUid && (!lastReadAt || createdIso > lastReadAt)) {
            unreadCount += 1;
          }
        });
      }

      const nowIso = new Date().toISOString();
      const item: ConversationListItem = {
        id: convId,
        last_message_preview:
          typeof data.last_message_preview === 'string' && data.last_message_preview.length > 0
            ? data.last_message_preview
            : null,
        last_message_at:
          typeof data.last_message_at === 'string' ? data.last_message_at : nowIso,
        created_at: toIsoString(data.createdAt, nowIso),
        unread_count: unreadCount,
        archived,
        other_user: otherProfile,
      };
      return item;
    })
  );

  items.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  return items;
}

export async function markConversationRead(
  conversationId: string,
  currentUid: string,
  minReadAtIso?: string
): Promise<void> {
  if (!currentUid) return;
  const participantPath = `conversations/${conversationId}/participants/${currentUid}`;
  const participantRef = doc(db, 'conversations', conversationId, 'participants', currentUid);

  try {
    const snap = await getDoc(participantRef);
    const nowMs = Date.now();
    const minMs = minReadAtIso ? Date.parse(minReadAtIso) : NaN;
    const existingData = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    const existingIso =
      typeof existingData?.last_read_at === 'string' ? existingData.last_read_at : '';
    const existingMs = existingIso ? Date.parse(existingIso) : NaN;

    let bestMs = nowMs;
    if (!Number.isNaN(minMs) && minMs > bestMs) {
      bestMs = minMs;
    }
    if (!Number.isNaN(existingMs) && existingMs > bestMs) {
      bestMs = existingMs;
    }

    const targetReadIso = new Date(bestMs).toISOString().slice(0, 40);

    if (snap.exists()) {
      if (!Number.isNaN(existingMs) && existingMs >= bestMs) {
        return;
      }
      await updateDoc(participantRef, {
        last_read_at: targetReadIso,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(participantRef, {
        uid: currentUid,
        conversation_id: conversationId,
        last_read_at: targetReadIso,
        is_typing: false,
        typing_updated_at: targetReadIso,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, participantPath);
  }
}

export async function setConversationArchived(
  conversationId: string,
  currentUid: string,
  archived: boolean
): Promise<void> {
  if (!currentUid) return;
  const nowIso = new Date().toISOString();
  const participantPath = `conversations/${conversationId}/participants/${currentUid}`;
  const participantRef = doc(db, 'conversations', conversationId, 'participants', currentUid);

  try {
    const snap = await getDoc(participantRef);
    if (snap.exists()) {
      await updateDoc(participantRef, {
        archived: Boolean(archived),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(participantRef, {
        uid: currentUid,
        conversation_id: conversationId,
        last_read_at: nowIso,
        is_typing: false,
        typing_updated_at: nowIso,
        archived: Boolean(archived),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, participantPath);
  }
}

async function resolveConversationParticipants(
  conversationId: string
): Promise<{ participantA: string; participantB: string }> {
  const convPath = `conversations/${conversationId}`;
  try {
    const snap = await getDoc(doc(db, 'conversations', conversationId));
    if (!snap.exists()) {
      throw new Error('Conversation not found.');
    }
    const data = snap.data() as Record<string, unknown>;
    return {
      participantA: String(data.participantA ?? ''),
      participantB: String(data.participantB ?? ''),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, convPath);
  }
}

function mapDocToMessage(id: string, data: Record<string, unknown>): Message {
  return {
    id,
    conversation_id: String(data.conversation_id ?? ''),
    sender_id: String(data.sender_id ?? ''),
    content: String(data.content ?? ''),
    message_type: data.message_type === 'sticker' ? 'sticker' : 'text',
    sticker_id:
      typeof data.sticker_id === 'string' && data.sticker_id.length > 0
        ? data.sticker_id
        : null,
    created_at:
      typeof data.created_at_iso === 'string' && data.created_at_iso.length > 0
        ? data.created_at_iso
        : toIsoString(data.createdAt),
    reactions: [],
  };
}

function mapDocToReaction(id: string, data: Record<string, unknown>): MessageReaction {
  return {
    id,
    message_id: String(data.message_id ?? ''),
    conversation_id: String(data.conversation_id ?? ''),
    user_id: String(data.user_id ?? ''),
    emoji: String(data.emoji ?? ''),
    created_at:
      typeof data.created_at_iso === 'string' && data.created_at_iso.length > 0
        ? data.created_at_iso
        : toIsoString(data.createdAt),
  };
}

export async function fetchMessages(
  conversationId: string,
  currentUid: string
): Promise<Message[]> {
  const { participantA } = await resolveConversationParticipants(conversationId);
  const myRoleField = participantA === currentUid ? 'participantA' : 'participantB';
  const messagesPath = `conversations/${conversationId}/messages`;
  const reactionsPath = `conversations/${conversationId}/reactions`;

  const [messagesSnap, reactionsSnap] = await Promise.all([
    getDocs(
      query(collection(db, 'conversations', conversationId, 'messages'), where(myRoleField, '==', currentUid))
    ).catch((error) => handleFirestoreError(error, OperationType.LIST, messagesPath)),
    getDocs(
      query(collection(db, 'conversations', conversationId, 'reactions'), where(myRoleField, '==', currentUid))
    ).catch((error) => handleFirestoreError(error, OperationType.LIST, reactionsPath)),
  ]);

  const reactionsByMessage = new Map<string, MessageReaction[]>();
  reactionsSnap.forEach((rDoc) => {
    const reaction = mapDocToReaction(rDoc.id, rDoc.data() as Record<string, unknown>);
    const list = reactionsByMessage.get(reaction.message_id) ?? [];
    list.push(reaction);
    reactionsByMessage.set(reaction.message_id, list);
  });

  const msgs: Message[] = [];
  messagesSnap.forEach((mDoc) => {
    const msg = mapDocToMessage(mDoc.id, mDoc.data() as Record<string, unknown>);
    msg.reactions = reactionsByMessage.get(msg.id) ?? [];
    msgs.push(msg);
  });

  msgs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return msgs;
}

export async function searchMessagesAcrossConversations(
  currentUid: string,
  queryStr: string,
  knownConversations?: ConversationListItem[]
): Promise<MessageSearchResult[]> {
  const normalized = queryStr.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const conversations =
    knownConversations && knownConversations.length > 0
      ? knownConversations
      : await fetchConversations(currentUid);

  if (conversations.length === 0) {
    return [];
  }

  const perConversationMatches = await Promise.all(
    conversations.map(async (conv) => {
      const myRoleField =
        currentUid < conv.other_user.id ? 'participantA' : 'participantB';
      const messagesPath = `conversations/${conv.id}/messages`;

      const snap = await getDocs(
        query(
          collection(db, 'conversations', conv.id, 'messages'),
          where(myRoleField, '==', currentUid)
        )
      ).catch((error) => handleFirestoreError(error, OperationType.LIST, messagesPath));

      const matched: { result: MessageSearchResult; exactPhrase: boolean }[] = [];
      snap.forEach((docSnap) => {
        const msg = mapDocToMessage(docSnap.id, docSnap.data() as Record<string, unknown>);
        const lower = msg.content.toLowerCase();
        const exactPhrase = lower.includes(normalized);
        const matchesAllTokens = exactPhrase || tokens.every((t) => lower.includes(t));
        if (matchesAllTokens) {
          matched.push({
            result: {
              message: msg,
              conversation_id: conv.id,
              other_user: conv.other_user,
            },
            exactPhrase,
          });
        }
      });

      return matched;
    })
  );

  const combined = perConversationMatches.flat();
  combined.sort((a, b) => {
    if (a.exactPhrase !== b.exactPhrase) {
      return a.exactPhrase ? -1 : 1;
    }
    return b.result.message.created_at.localeCompare(a.result.message.created_at);
  });

  return combined.slice(0, 50).map((entry) => entry.result);
}

export async function addMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string
): Promise<MessageReaction> {
  const { participantA, participantB } = await resolveConversationParticipants(conversationId);
  const reactionId = `${messageId}_${userId}_${emojiToHex(emoji)}`;
  const reactionPath = `conversations/${conversationId}/reactions/${reactionId}`;
  const reactionRef = doc(db, 'conversations', conversationId, 'reactions', reactionId);
  const nowIso = new Date().toISOString();

  try {
    await setDoc(reactionRef, {
      message_id: messageId,
      conversation_id: conversationId,
      user_id: userId,
      participantA,
      participantB,
      emoji: emoji.slice(0, 16),
      created_at_iso: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, reactionPath);
  }

  return {
    id: reactionId,
    message_id: messageId,
    conversation_id: conversationId,
    user_id: userId,
    emoji,
    created_at: nowIso,
  };
}

export async function removeMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const reactionId = `${messageId}_${userId}_${emojiToHex(emoji)}`;
  const reactionPath = `conversations/${conversationId}/reactions/${reactionId}`;
  const reactionRef = doc(db, 'conversations', conversationId, 'reactions', reactionId);

  try {
    await deleteDoc(reactionRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, reactionPath);
  }
}

export async function sendTextMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<Message> {
  const trimmed = content.trim().slice(0, MESSAGE_CONTENT_MAX);
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }

  const { participantA, participantB } = await resolveConversationParticipants(conversationId);
  const msgRef = doc(collection(db, 'conversations', conversationId, 'messages'));
  const msgPath = `conversations/${conversationId}/messages/${msgRef.id}`;
  const nowIso = new Date().toISOString();

  try {
    await setDoc(msgRef, {
      conversation_id: conversationId,
      sender_id: senderId,
      participantA,
      participantB,
      content: trimmed,
      message_type: 'text',
      sticker_id: '',
      created_at_iso: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }

  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      last_message_preview: trimmed.slice(0, PREVIEW_MAX),
      last_message_at: nowIso,
      last_sender_id: senderId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversationId}`);
  }

  return {
    id: msgRef.id,
    conversation_id: conversationId,
    sender_id: senderId,
    content: trimmed,
    message_type: 'text',
    sticker_id: null,
    created_at: nowIso,
    reactions: [],
  };
}

export async function sendStickerMessage(
  conversationId: string,
  senderId: string,
  stickerId: string,
  label: string
): Promise<Message> {
  const { participantA, participantB } = await resolveConversationParticipants(conversationId);
  const msgRef = doc(collection(db, 'conversations', conversationId, 'messages'));
  const msgPath = `conversations/${conversationId}/messages/${msgRef.id}`;
  const nowIso = new Date().toISOString();
  const content = `Sticker: ${label}`.slice(0, MESSAGE_CONTENT_MAX);
  const cleanStickerId = stickerId.slice(0, 64);

  try {
    await setDoc(msgRef, {
      conversation_id: conversationId,
      sender_id: senderId,
      participantA,
      participantB,
      content,
      message_type: 'sticker',
      sticker_id: cleanStickerId,
      created_at_iso: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }

  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      last_message_preview: content.slice(0, PREVIEW_MAX),
      last_message_at: nowIso,
      last_sender_id: senderId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversationId}`);
  }

  return {
    id: msgRef.id,
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    message_type: 'sticker',
    sticker_id: cleanStickerId,
    created_at: nowIso,
    reactions: [],
  };
}

export function subscribeToConversationMessages(
  conversationId: string,
  currentUid: string,
  onNewMessage: (message: Message) => void
): () => void {
  let active = true;
  let unsubscribeSnap: Unsubscribe | null = null;

  void resolveConversationParticipants(conversationId)
    .then(({ participantA }) => {
      if (!active) return;
      const myRoleField = participantA === currentUid ? 'participantA' : 'participantB';
      const q = query(
        collection(db, 'conversations', conversationId, 'messages'),
        where(myRoleField, '==', currentUid)
      );
      let isInitialSnapshot = true;
      unsubscribeSnap = onSnapshot(
        q,
        (snapshot) => {
          if (isInitialSnapshot) {
            isInitialSnapshot = false;
            return;
          }
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              onNewMessage(
                mapDocToMessage(change.doc.id, change.doc.data() as Record<string, unknown>)
              );
            }
          });
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `conversations/${conversationId}/messages`
          );
        }
      );
    })
    .catch(() => {
      // Conversation lookup error handled in resolveConversationParticipants
    });

  return () => {
    active = false;
    unsubscribeSnap?.();
  };
}

export function subscribeToConversationReactions(
  conversationId: string,
  currentUid: string,
  onInsert: (reaction: MessageReaction) => void,
  onDelete: (reaction: Partial<MessageReaction> & { id?: string }) => void
): () => void {
  let active = true;
  let unsubscribeSnap: Unsubscribe | null = null;

  void resolveConversationParticipants(conversationId)
    .then(({ participantA }) => {
      if (!active) return;
      const myRoleField = participantA === currentUid ? 'participantA' : 'participantB';
      const q = query(
        collection(db, 'conversations', conversationId, 'reactions'),
        where(myRoleField, '==', currentUid)
      );
      let isInitialSnapshot = true;
      unsubscribeSnap = onSnapshot(
        q,
        (snapshot) => {
          if (isInitialSnapshot) {
            isInitialSnapshot = false;
            return;
          }
          snapshot.docChanges().forEach((change) => {
            const reaction = mapDocToReaction(
              change.doc.id,
              change.doc.data() as Record<string, unknown>
            );
            if (change.type === 'added' || change.type === 'modified') {
              onInsert(reaction);
            } else if (change.type === 'removed') {
              onDelete(reaction);
            }
          });
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `conversations/${conversationId}/reactions`
          );
        }
      );
    })
    .catch(() => {});

  return () => {
    active = false;
    unsubscribeSnap?.();
  };
}

export function subscribeToConversationUpdates(
  currentUid: string,
  onRefreshNeeded: () => void
): () => void {
  const convCollection = collection(db, 'conversations');
  let initialA = true;
  let initialB = true;
  const unsubA = onSnapshot(
    query(convCollection, where('participantA', '==', currentUid)),
    () => {
      if (initialA) {
        initialA = false;
        return;
      }
      onRefreshNeeded();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );
  const unsubB = onSnapshot(
    query(convCollection, where('participantB', '==', currentUid)),
    () => {
      if (initialB) {
        initialB = false;
        return;
      }
      onRefreshNeeded();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );

  return () => {
    unsubA();
    unsubB();
  };
}

export function subscribeToProfileUpdates(
  watchedUserIds: string[],
  onProfileChange: (profile: Profile) => void
): () => void {
  const uniqueIds = Array.from(new Set(watchedUserIds.filter(Boolean)));
  const unsubscribes = uniqueIds.map((uid) =>
    onSnapshot(
      doc(db, 'presence', uid),
      (snap) => {
        if (snap.exists()) {
          onProfileChange(mapUserDocToProfile(snap.data() as Record<string, unknown>, uid));
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `presence/${uid}`)
    )
  );

  return () => {
    unsubscribes.forEach((u) => u());
  };
}

export interface TypingChannelController {
  sendTyping: (isTyping: boolean) => void;
  unsubscribe: () => void;
}

export function subscribeToTypingIndicator(
  conversationId: string,
  currentUid: string,
  otherUid: string,
  onTypingChange: (isTyping: boolean) => void
): TypingChannelController {
  let expiryTimer: number | null = null;

  const otherParticipantRef = doc(db, 'conversations', conversationId, 'participants', otherUid);
  const unsub = onSnapshot(
    otherParticipantRef,
    (snap) => {
      if (expiryTimer !== null) {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
      }

      if (!snap.exists()) {
        onTypingChange(false);
        return;
      }

      const data = snap.data() as Record<string, unknown>;
      const isTyping = Boolean(data.is_typing);
      const updatedIso = String(data.typing_updated_at ?? '');
      const ageMs = Date.now() - Date.parse(updatedIso);

      if (isTyping && (!Number.isNaN(ageMs) ? ageMs < 4500 : true)) {
        onTypingChange(true);
        const remaining = Number.isNaN(ageMs) ? 3500 : Math.max(500, 4500 - ageMs);
        expiryTimer = window.setTimeout(() => {
          expiryTimer = null;
          onTypingChange(false);
        }, remaining);
      } else {
        onTypingChange(false);
      }
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.GET,
        `conversations/${conversationId}/participants/${otherUid}`
      );
    }
  );

  const pushTypingState = async (isTyping: boolean) => {
    const nowIso = new Date().toISOString();
    const myRef = doc(db, 'conversations', conversationId, 'participants', currentUid);
    try {
      const snap = await getDoc(myRef);
      if (snap.exists()) {
        await updateDoc(myRef, {
          is_typing: isTyping,
          typing_updated_at: nowIso,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(myRef, {
          uid: currentUid,
          conversation_id: conversationId,
          last_read_at: nowIso,
          is_typing: isTyping,
          typing_updated_at: nowIso,
          archived: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Typing indicator is ephemeral; ignore transient update errors
    }
  };

  return {
    sendTyping: (isTyping: boolean) => {
      void pushTypingState(isTyping);
    },
    unsubscribe: () => {
      if (expiryTimer !== null) {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      void pushTypingState(false);
      unsub();
    },
  };
}

export function subscribeToReadReceipt(
  conversationId: string,
  otherUid: string,
  onReadAtChange: (lastReadAt: string | null) => void
): () => void {
  const otherParticipantRef = doc(db, 'conversations', conversationId, 'participants', otherUid);
  return onSnapshot(
    otherParticipantRef,
    (snap) => {
      if (!snap.exists()) {
        onReadAtChange(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const lastReadAt =
        typeof data.last_read_at === 'string' && data.last_read_at.length > 0
          ? data.last_read_at
          : null;
      onReadAtChange(lastReadAt);
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.GET,
        `conversations/${conversationId}/participants/${otherUid}`
      );
    }
  );
}

function mapDocToStatus(id: string, data: Record<string, unknown>): StatusItem {
  const rawType = String(data.media_type ?? 'text');
  const media_type: StatusMediaType =
    rawType === 'image' || rawType === 'video' || rawType === 'sticker' ? rawType : 'text';
  const nowIso = new Date().toISOString();
  return {
    id,
    author_id: String(data.author_id ?? ''),
    author_name: String(data.author_name ?? 'vonChat member'),
    author_avatar_color:
      typeof data.author_avatar_color === 'string' ? data.author_avatar_color : '#166534',
    media_type,
    caption: typeof data.caption === 'string' ? data.caption : '',
    media_url: typeof data.media_url === 'string' ? data.media_url : '',
    sticker_id: typeof data.sticker_id === 'string' ? data.sticker_id : '',
    background_theme:
      typeof data.background_theme === 'string' ? data.background_theme : 'forest',
    visible_to: Array.isArray(data.visible_to)
      ? data.visible_to.filter((v): v is string => typeof v === 'string')
      : [],
    created_at:
      typeof data.created_at_iso === 'string' && data.created_at_iso.length > 0
        ? data.created_at_iso
        : toIsoString(data.createdAt, nowIso),
    expires_at:
      typeof data.expires_at_iso === 'string' && data.expires_at_iso.length > 0
        ? data.expires_at_iso
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function createStatus(input: {
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  mediaType: StatusMediaType;
  caption?: string;
  mediaUrl?: string;
  stickerId?: string;
  backgroundTheme?: string;
  visibleToUids: string[];
}): Promise<StatusItem> {
  const statusRef = doc(collection(db, 'statuses'));
  const statusPath = `statuses/${statusRef.id}`;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString().slice(0, 40);
  const expiresIso = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 40);

  const visibleTo = Array.from(
    new Set([input.authorId, ...input.visibleToUids.filter(Boolean)])
  ).slice(0, 50);

  const cleanCaption = (input.caption ?? '').trim().slice(0, 300);
  const cleanMediaUrl = (input.mediaUrl ?? '').slice(0, 750000);
  const cleanStickerId = (input.stickerId ?? '').slice(0, 64);
  const cleanTheme = /^[a-z0-9_]+$/.test(input.backgroundTheme ?? '')
    ? String(input.backgroundTheme).slice(0, 24)
    : 'forest';
  const cleanAuthorName = sanitizeDisplayName(input.authorName, 'vonChat member');
  const cleanAvatarColor = /^#[0-9a-fA-F]{6}$/.test(input.authorAvatarColor)
    ? input.authorAvatarColor
    : pickAvatarColor(input.authorId);

  if (input.mediaType === 'text' && !cleanCaption) {
    throw new Error('Please enter text for your status.');
  }
  if ((input.mediaType === 'image' || input.mediaType === 'video') && !cleanMediaUrl) {
    throw new Error('Please capture or choose media for your status.');
  }
  if (input.mediaType === 'sticker' && !cleanStickerId) {
    throw new Error('Please choose a sticker for your status.');
  }

  try {
    await setDoc(statusRef, {
      id: statusRef.id,
      author_id: input.authorId,
      author_name: cleanAuthorName,
      author_avatar_color: cleanAvatarColor,
      media_type: input.mediaType,
      caption: cleanCaption,
      media_url: cleanMediaUrl,
      sticker_id: cleanStickerId,
      background_theme: cleanTheme,
      visible_to: visibleTo,
      created_at_iso: nowIso,
      expires_at_iso: expiresIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, statusPath);
  }

  return {
    id: statusRef.id,
    author_id: input.authorId,
    author_name: cleanAuthorName,
    author_avatar_color: cleanAvatarColor,
    media_type: input.mediaType,
    caption: cleanCaption,
    media_url: cleanMediaUrl,
    sticker_id: cleanStickerId,
    background_theme: cleanTheme,
    visible_to: visibleTo,
    created_at: nowIso,
    expires_at: expiresIso,
  };
}

export async function fetchStatuses(currentUid: string): Promise<StatusItem[]> {
  const q = query(
    collection(db, 'statuses'),
    where('visible_to', 'array-contains', currentUid)
  );
  const snap = await getDocs(q).catch((error) =>
    handleFirestoreError(error, OperationType.LIST, 'statuses')
  );
  const nowIso = new Date().toISOString();
  const list: StatusItem[] = [];
  snap.forEach((docSnap) => {
    const item = mapDocToStatus(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (item.expires_at > nowIso) {
      list.push(item);
    }
  });
  list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return list;
}

export function subscribeToStatuses(
  currentUid: string,
  onStatusesChange: (statuses: StatusItem[]) => void
): () => void {
  const q = query(
    collection(db, 'statuses'),
    where('visible_to', 'array-contains', currentUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const nowIso = new Date().toISOString();
      const list: StatusItem[] = [];
      snapshot.forEach((docSnap) => {
        const item = mapDocToStatus(docSnap.id, docSnap.data() as Record<string, unknown>);
        if (item.expires_at > nowIso) {
          list.push(item);
        }
      });
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      onStatusesChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'statuses');
    }
  );
}

export async function deleteStatus(statusId: string): Promise<void> {
  const statusPath = `statuses/${statusId}`;
  try {
    await deleteDoc(doc(db, 'statuses', statusId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, statusPath);
  }
}

export async function markStatusViewed(
  statusId: string,
  authorId: string,
  viewer: { uid: string; displayName: string; avatarColor: string }
): Promise<void> {
  if (!viewer.uid || viewer.uid === authorId) return;
  const viewPath = `statuses/${statusId}/views/${viewer.uid}`;
  const viewRef = doc(db, 'statuses', statusId, 'views', viewer.uid);
  const nowIso = new Date().toISOString().slice(0, 40);
  const cleanName = sanitizeDisplayName(viewer.displayName, 'vonChat member');
  const cleanColor = /^#[0-9a-fA-F]{6}$/.test(viewer.avatarColor)
    ? viewer.avatarColor
    : pickAvatarColor(viewer.uid);

  try {
    const snap = await getDoc(viewRef);
    if (snap.exists()) {
      await updateDoc(viewRef, {
        viewer_name: cleanName,
        viewer_avatar_color: cleanColor,
        viewed_at_iso: nowIso,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(viewRef, {
        status_id: statusId,
        author_id: authorId,
        viewer_id: viewer.uid,
        viewer_name: cleanName,
        viewer_avatar_color: cleanColor,
        viewed_at_iso: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // View tracking is best-effort; ignore if status expired or was deleted
  }
}

export async function fetchStatusViews(
  statusId: string,
  authorUid: string
): Promise<StatusViewRecord[]> {
  const viewsPath = `statuses/${statusId}/views`;
  const q = query(
    collection(db, 'statuses', statusId, 'views'),
    where('author_id', '==', authorUid)
  );
  const snap = await getDocs(q).catch((error) =>
    handleFirestoreError(error, OperationType.LIST, viewsPath)
  );
  const views: StatusViewRecord[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    views.push({
      status_id: statusId,
      viewer_id: String(data.viewer_id ?? docSnap.id),
      viewer_name: String(data.viewer_name ?? 'vonChat member'),
      viewer_avatar_color:
        typeof data.viewer_avatar_color === 'string' ? data.viewer_avatar_color : '#166534',
      viewed_at:
        typeof data.viewed_at_iso === 'string'
          ? data.viewed_at_iso
          : toIsoString(data.updatedAt),
    });
  });
  views.sort((a, b) => b.viewed_at.localeCompare(a.viewed_at));
  return views;
}

