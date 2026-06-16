type IconProps = {
  className?: string;
};

export function TabMatchesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3c-2.5 2.8-4 6.2-4 9s1.5 6.2 4 9c2.5-2.8 4-6.2 4-9s-1.5-6.2-4-9Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function TabRankIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M7 17V9l5-3 5 3v8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M5 17h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 13h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TabWalletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect
        x="3"
        y="6"
        width="18"
        height="13"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3 10h18"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="16.5" cy="14" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function TabClaimIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M12 3 4 7v6c0 4.4 3.6 8.5 8 9.5 4.4-1 8-5.1 8-9.5V7l-8-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
