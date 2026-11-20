interface StickerArtProps {
  stickerId: string;
  className?: string;
}

export function StickerArt({ stickerId, className = 'w-24 h-24' }: StickerArtProps) {
  switch (stickerId) {
    case 'crown_hi':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#0B2316" />
          <rect x="9" y="9" width="78" height="78" rx="23" stroke="#22C55E" strokeOpacity="0.45" strokeWidth="2" />
          <path
            d="M25 58L21 32L36 44L48 25L60 44L75 32L71 58H25Z"
            fill="#166534"
            stroke="#4ADE80"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M29 66H67" stroke="#86EFAC" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="20" r="3" fill="#86EFAC" />
          <circle cx="21" cy="27" r="2.5" fill="#4ADE80" />
          <circle cx="75" cy="27" r="2.5" fill="#4ADE80" />
          <circle cx="40" cy="49" r="2.2" fill="#ECFDF5" />
          <circle cx="56" cy="49" r="2.2" fill="#ECFDF5" />
          <path d="M44 53C46 55 50 55 52 53" stroke="#ECFDF5" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );

    case 'tea_cozy':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#ECFDF5" stroke="#BBF7D0" strokeWidth="2" />
          <path d="M36 24C36 20 40 19 40 15" stroke="#16A34A" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M48 23C48 19 52 18 52 14" stroke="#16A34A" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M60 24C60 20 64 19 64 15" stroke="#16A34A" strokeWidth="2.6" strokeLinecap="round" />
          <path
            d="M26 37H66V54C66 65.0457 57.0457 74 46 74C34.9543 74 26 65.0457 26 54V37Z"
            fill="#15803D"
          />
          <path
            d="M66 41H71C74.866 41 78 44.134 78 48C78 51.866 74.866 55 71 55H66"
            stroke="#15803D"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse cx="46" cy="37" rx="20" ry="4.5" fill="#86EFAC" />
          <path d="M38 52C41 55 51 55 54 52" stroke="#ECFDF5" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );

    case 'leaf_yay':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="2" />
          <circle cx="24" cy="26" r="3" fill="#22C55E" />
          <circle cx="72" cy="24" r="2.5" fill="#F59E0B" />
          <circle cx="74" cy="64" r="3" fill="#4ADE80" />
          <path d="M48 72V44" stroke="#166534" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M48 48C48 33 61 24 72 26C70 40 60 50 48 48Z"
            fill="#22C55E"
          />
          <path
            d="M48 53C48 39 36 30 24 32C26 45 36 55 48 53Z"
            fill="#15803D"
          />
          <path d="M36 73H60" stroke="#166534" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );

    case 'thumbs_sprout':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#14532D" />
          <circle cx="48" cy="48" r="28" fill="#166534" stroke="#4ADE80" strokeWidth="2.5" />
          <path
            d="M34 48V61H40V48H34ZM43 48L48.5 34.5C49.3 32.6 51.8 32.3 53 33.9C53.6 34.7 53.8 35.8 53.5 36.8L52 43H62.2C64.4 43 66 45.1 65.5 47.3L62.8 58.3C62.3 60 60.8 61 59 61H43V48Z"
            fill="#86EFAC"
          />
        </svg>
      );

    case 'heart_bloom':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#ECFDF5" stroke="#A7F3D0" strokeWidth="2" />
          <path
            d="M48 70C48 70 24 55.5 24 38.5C24 31 29.8 25 37 25C41.8 25 45.9 27.6 48 31.5C50.1 27.6 54.2 25 59 25C66.2 25 72 31 72 38.5C72 55.5 48 70 48 70Z"
            fill="#16A34A"
          />
          <path
            d="M35 37C35 34.5 37 32.5 39.5 32.5"
            stroke="#BBF7D0"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <circle cx="24" cy="68" r="2.5" fill="#22C55E" />
          <circle cx="72" cy="24" r="2.5" fill="#22C55E" />
        </svg>
      );

    case 'coffee_focus':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#F4F8F5" stroke="#C5DACD" strokeWidth="2" />
          <rect x="24" y="58" width="48" height="12" rx="6" fill="#0F291A" />
          <rect x="30" y="29" width="36" height="29" rx="6" fill="#166534" />
          <rect x="34" y="33" width="28" height="18" rx="3" fill="#BBF7D0" />
          <path d="M40 42L45 47L56 37" stroke="#14532D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'sleepy_moon':
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#091E12" />
          <path
            d="M57 25C44.8 26.2 35.5 36.5 35.5 49C35.5 62.3 46.2 73 59.5 73C64.2 73 68.6 71.6 72.3 69.3C62 67.6 54 58.6 54 47.8C54 38.4 59.9 30.3 68.2 27.1C64.8 25.7 61 24.6 57 25Z"
            fill="#86EFAC"
          />
          <circle cx="28" cy="30" r="2.5" fill="#4ADE80" />
          <circle cx="71" cy="40" r="2" fill="#ECFDF5" />
          <path d="M26 58L32 58L26 65L32 65" stroke="#4ADE80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'party_crown':
    default:
      return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
          <rect x="8" y="8" width="80" height="80" rx="24" fill="#FEFCE8" stroke="#FDE047" strokeWidth="2" />
          <path
            d="M25 60L22 35L37 46L48 27L59 46L74 35L71 60H25Z"
            fill="#15803D"
            stroke="#166534"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M29 67H67" stroke="#166534" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="21" r="3" fill="#EAB308" />
          <circle cx="22" cy="29" r="2.5" fill="#22C55E" />
          <circle cx="74" cy="29" r="2.5" fill="#22C55E" />
          <circle cx="67" cy="20" r="2" fill="#EAB308" />
          <circle cx="29" cy="20" r="2" fill="#EAB308" />
        </svg>
      );
  }
}
