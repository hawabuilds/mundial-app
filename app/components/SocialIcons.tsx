type IconProps = {
  className?: string;
};

export function XIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622z" />
    </svg>
  );
}

export function TelegramIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M21.943 4.674A1.2 1.2 0 0 0 20.8 4.2L3.654 11.076a1.2 1.2 0 0 0 .045 2.248l3.856 1.368 1.476 4.512a1.2 1.2 0 0 0 1.932.396l2.088-2.088 4.308 3.18a1.2 1.2 0 0 0 1.884-.756l2.7-14.4a1.2 1.2 0 0 0-1.602-1.362zM8.61 13.89l7.878-4.878-5.916 6.42-.396 3.204-1.566-4.746z" />
    </svg>
  );
}
