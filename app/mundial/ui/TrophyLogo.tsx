type TrophyLogoProps = {
  className?: string;
  size?: number;
};

/** Abstract cobalt trophy mark — Mundial brand */
export default function TrophyLogo({ className, size = 36 }: TrophyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path d="M12 6h16l-1.5 4H13.5L12 6Z" fill="#2F7BFF" opacity="0.9" />
      <path
        d="M10 10h20c0 6-3 10.5-8 12.5v5.5h-4v-5.5C13 20.5 10 16 10 10Z"
        fill="#2F7BFF"
      />
      <path
        d="M8 14H6c0-2.2 1.8-4 4-4h0M32 14h2c0-2.2-1.8-4-4-4h0"
        stroke="#2F7BFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M14 32h12v2H14v-2Z" fill="#2F7BFF" opacity="0.7" />
      <ellipse cx="20" cy="10" rx="8" ry="2" fill="#2F7BFF" opacity="0.25" />
    </svg>
  );
}
