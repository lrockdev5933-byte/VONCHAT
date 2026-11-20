interface VonChatLogoProps {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
}

export function VonChatLogo({ size = 'md', tone = 'light' }: VonChatLogoProps) {
  const badgeDims =
    size === 'lg'
      ? 'w-12 h-12 rounded-2xl'
      : size === 'sm'
        ? 'w-8 h-8 rounded-xl'
        : 'w-10 h-10 rounded-xl';

  const iconDims =
    size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-4.5 h-4.5' : 'w-5.5 h-5.5';

  const textSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl';

  const vonColor = tone === 'dark' ? 'text-[#ECFDF5]' : 'text-[#0F291A]';
  const chatColor = tone === 'dark' ? 'text-[#4ADE80]' : 'text-[#15803D]';

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <div
        className={`${badgeDims} bg-[#091E12] border border-[#22C55E]/40 flex items-center justify-center shadow-[0_0_16px_rgba(34,197,94,0.28)] shrink-0`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className={`${iconDims} drop-shadow-[0_0_6px_rgba(74,222,128,0.85)]`}
        >
          <path
            d="M4.5 22.5L3 10.5L10.5 16L16 7.5L21.5 16L29 10.5L27.5 22.5H4.5Z"
            stroke="#4ADE80"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="rgba(74, 222, 128, 0.14)"
          />
          <path
            d="M6.5 25.5H25.5"
            stroke="#86EFAC"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="16" cy="5.5" r="1.4" fill="#86EFAC" />
          <circle cx="3" cy="8.5" r="1.2" fill="#4ADE80" />
          <circle cx="29" cy="8.5" r="1.2" fill="#4ADE80" />
        </svg>
      </div>
      <span className={`${textSize} font-bold tracking-tight whitespace-nowrap`}>
        <span className={vonColor}>von</span>
        <span className={chatColor}>Chat</span>
      </span>
    </div>
  );
}
