import type { CSSProperties } from 'react';

export interface ChatWallpaperTheme {
  id: string;
  name: string;
  description: string;
  backgroundColor: string;
  swatchColor: string;
  style: CSSProperties;
}

const EUCALYPTUS_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none"><path d="M26 70C26 48 40 30 62 24C58 46 44 64 26 70Z" stroke="#15803D" stroke-opacity="0.08" stroke-width="1.5"/><path d="M26 70L58 28" stroke="#15803D" stroke-opacity="0.07" stroke-width="1.2" stroke-linecap="round"/><circle cx="74" cy="72" r="2.2" fill="#15803D" fill-opacity="0.07"/></svg>`
);

const MOSS_CONTOUR_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80" fill="none"><path d="M0 24C28 12 52 36 80 24C100 16 110 20 120 24" stroke="#3F6212" stroke-opacity="0.07" stroke-width="1.4"/><path d="M0 56C30 44 60 68 90 56C106 50 114 53 120 56" stroke="#3F6212" stroke-opacity="0.07" stroke-width="1.4"/></svg>`
);

const FERN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88" fill="none"><path d="M44 74V18" stroke="#166534" stroke-opacity="0.08" stroke-width="1.4" stroke-linecap="round"/><path d="M44 58C35 55 29 49 27 42C35 43 41 49 44 58Z" fill="#166534" fill-opacity="0.05"/><path d="M44 46C53 43 59 37 61 30C53 31 47 37 44 46Z" fill="#166534" fill-opacity="0.05"/><path d="M44 34C36 31 31 26 29 20C36 21 41 26 44 34Z" fill="#166534" fill-opacity="0.05"/></svg>`
);

const BAMBOO_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 72 96" fill="none"><path d="M20 0V96M52 0V96" stroke="#0F766E" stroke-opacity="0.07" stroke-width="1.4"/><path d="M16 32H24M16 68H24M48 18H56M48 56H56" stroke="#0F766E" stroke-opacity="0.09" stroke-width="1.4" stroke-linecap="round"/></svg>`
);

export const DEFAULT_WALLPAPER_ID = 'meadow_mist';

export const CHAT_WALLPAPERS: ChatWallpaperTheme[] = [
  {
    id: 'meadow_mist',
    name: 'Meadow Mist',
    description: 'Clean airy sage',
    backgroundColor: '#F7FAF8',
    swatchColor: '#E5F2E9',
    style: {
      backgroundColor: '#F7FAF8',
      backgroundImage:
        'radial-gradient(circle at 18% 15%, rgba(187, 247, 208, 0.24), transparent 45%), radial-gradient(circle at 85% 82%, rgba(209, 250, 229, 0.28), transparent 48%)',
    },
  },
  {
    id: 'eucalyptus_breeze',
    name: 'Eucalyptus',
    description: 'Soft botanical leaves',
    backgroundColor: '#EFF7F2',
    swatchColor: '#D6ECE0',
    style: {
      backgroundColor: '#EFF7F2',
      backgroundImage: `url("data:image/svg+xml,${EUCALYPTUS_SVG}"), linear-gradient(160deg, #F4FAF6 0%, #E7F3EC 100%)`,
      backgroundRepeat: 'repeat, no-repeat',
      backgroundSize: '96px 96px, 100% 100%',
    },
  },
  {
    id: 'morning_fern',
    name: 'Morning Fern',
    description: 'Sunlit forest fronds',
    backgroundColor: '#F1F8F3',
    swatchColor: '#DCF0E2',
    style: {
      backgroundColor: '#F1F8F3',
      backgroundImage: `url("data:image/svg+xml,${FERN_SVG}"), linear-gradient(145deg, #F6FBF7 0%, #E5F3E9 100%)`,
      backgroundRepeat: 'repeat, no-repeat',
      backgroundSize: '88px 88px, 100% 100%',
    },
  },
  {
    id: 'moss_stone',
    name: 'River Moss',
    description: 'Calm pebble contours',
    backgroundColor: '#F3F6F1',
    swatchColor: '#E4ECD9',
    style: {
      backgroundColor: '#F3F6F1',
      backgroundImage: `url("data:image/svg+xml,${MOSS_CONTOUR_SVG}"), linear-gradient(170deg, #F7F9F5 0%, #EAF0E5 100%)`,
      backgroundRepeat: 'repeat, no-repeat',
      backgroundSize: '120px 80px, 100% 100%',
    },
  },
  {
    id: 'bamboo_rain',
    name: 'Bamboo Rain',
    description: 'Serene mist & reeds',
    backgroundColor: '#EEF5F4',
    swatchColor: '#D8EAE8',
    style: {
      backgroundColor: '#EEF5F4',
      backgroundImage: `url("data:image/svg+xml,${BAMBOO_SVG}"), linear-gradient(160deg, #F4F9F8 0%, #E3EEEC 100%)`,
      backgroundRepeat: 'repeat, no-repeat',
      backgroundSize: '72px 96px, 100% 100%',
    },
  },
];

export function getWallpaperById(id: string | null | undefined): ChatWallpaperTheme {
  return (
    CHAT_WALLPAPERS.find((w) => w.id === id) ??
    CHAT_WALLPAPERS[0]
  );
}

export function getStoredWallpaperId(uid: string): string | null {
  try {
    return window.localStorage.getItem(`vonchat_wallpaper_${uid}`);
  } catch {
    return null;
  }
}

export function setStoredWallpaperId(uid: string, wallpaperId: string): void {
  try {
    window.localStorage.setItem(`vonchat_wallpaper_${uid}`, wallpaperId);
  } catch {
    // Ignore storage failures in restricted frames
  }
}
