export interface VonSticker {
  id: string;
  label: string;
  caption: string;
}

export const VONCHAT_STICKERS: VonSticker[] = [
  { id: 'crown_hi', label: 'Royal Hi!', caption: 'Friendly wave' },
  { id: 'tea_cozy', label: 'Tea Time', caption: 'Calm break' },
  { id: 'leaf_yay', label: 'Yay!', caption: 'Excited' },
  { id: 'thumbs_sprout', label: 'Nice!', caption: 'Approved' },
  { id: 'heart_bloom', label: 'Care', caption: 'Warm thanks' },
  { id: 'coffee_focus', label: 'Focusing', caption: 'Deep work' },
  { id: 'sleepy_moon', label: 'Goodnight', caption: 'Signing off' },
  { id: 'party_crown', label: 'Congrats!', caption: 'Celebrate' },
];

export function getStickerById(id: string | null | undefined): VonSticker | undefined {
  if (!id) return undefined;
  return VONCHAT_STICKERS.find((s) => s.id === id);
}
