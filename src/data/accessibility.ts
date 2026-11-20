export type ChatTextSize = 'small' | 'medium' | 'large';

export interface ChatTextSizeConfig {
  id: ChatTextSize;
  label: string;
  scaleNote: string;
  messageClass: string;
  composerClass: string;
  sidebarPreviewClass: string;
  metaClass: string;
}

export const DEFAULT_CHAT_TEXT_SIZE: ChatTextSize = 'medium';

export const CHAT_TEXT_SIZE_OPTIONS: ChatTextSizeConfig[] = [
  {
    id: 'small',
    label: 'Small',
    scaleNote: '13px',
    messageClass: 'text-[13px] leading-snug',
    composerClass: 'text-[13px]',
    sidebarPreviewClass: 'text-[11px]',
    metaClass: 'text-[11px]',
  },
  {
    id: 'medium',
    label: 'Medium',
    scaleNote: '14px',
    messageClass: 'text-sm leading-relaxed',
    composerClass: 'text-sm',
    sidebarPreviewClass: 'text-xs',
    metaClass: 'text-xs',
  },
  {
    id: 'large',
    label: 'Large',
    scaleNote: '16px',
    messageClass: 'text-base leading-relaxed',
    composerClass: 'text-base',
    sidebarPreviewClass: 'text-[13px]',
    metaClass: 'text-[13px]',
  },
];

export function isValidChatTextSize(value: unknown): value is ChatTextSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function getChatTextSizeConfig(
  size: ChatTextSize | string | null | undefined
): ChatTextSizeConfig {
  return (
    CHAT_TEXT_SIZE_OPTIONS.find((option) => option.id === size) ??
    CHAT_TEXT_SIZE_OPTIONS[1]
  );
}

export function getStoredChatTextSize(uid: string): ChatTextSize {
  if (!uid) return DEFAULT_CHAT_TEXT_SIZE;
  try {
    const raw = window.localStorage.getItem(`vonchat_text_size_${uid}`);
    return isValidChatTextSize(raw) ? raw : DEFAULT_CHAT_TEXT_SIZE;
  } catch {
    return DEFAULT_CHAT_TEXT_SIZE;
  }
}

export function setStoredChatTextSize(uid: string, size: ChatTextSize): void {
  if (!uid) return;
  try {
    window.localStorage.setItem(`vonchat_text_size_${uid}`, size);
  } catch {
    // Ignore storage failures in restricted frames
  }
}
