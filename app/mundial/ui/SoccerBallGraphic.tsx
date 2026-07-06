import { buildFootballArtwork, FOOTBALL_CLIP_RADIUS } from "./soccerBallGeometry";

type SoccerBallGraphicProps = {
  idPrefix: string;
  className?: string;
};

/** Classic Telstar — lit truncated icosahedron with leather-style volume. */
export default function SoccerBallGraphic({
  idPrefix,
  className,
}: SoccerBallGraphicProps) {
  const clipId = `${idPrefix}-clip`;
  const shadeId = `${idPrefix}-shade`;
  const shadeDeepId = `${idPrefix}-shade-deep`;
  const specId = `${idPrefix}-spec`;
  const specSoftId = `${idPrefix}-spec-soft`;
  const rimId = `${idPrefix}-rim`;
  const aoId = `${idPrefix}-ao`;

  const { panels } = buildFootballArtwork();
  const r = FOOTBALL_CLIP_RADIUS;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      shapeRendering="geometricPrecision"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={shadeId} cx="34%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="42%" stopColor="#f4f4f4" />
          <stop offset="100%" stopColor="#c8c8c8" />
        </radialGradient>

        <radialGradient id={shadeDeepId} cx="62%" cy="78%" r="58%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.28)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        <radialGradient id={rimId} cx="68%" cy="74%" r="48%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.36)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        <radialGradient id={specId} cx="26%" cy="20%" r="22%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        <radialGradient id={specSoftId} cx="38%" cy="32%" r="34%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        <radialGradient id={aoId} cx="50%" cy="88%" r="42%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        <clipPath id={clipId}>
          <circle cx="50" cy="50" r={r} />
        </clipPath>
      </defs>

      <circle cx="50" cy="50" r={r} fill={`url(#${shadeId})`} />
      <circle cx="50" cy="50" r={r} fill={`url(#${shadeDeepId})`} />

      <g clipPath={`url(#${clipId})`}>
        {panels.map((panel, index) => (
          <path
            key={index}
            d={panel.d}
            fill={panel.fill}
            stroke={panel.stroke}
            strokeWidth="0.32"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </g>

      <circle cx="50" cy="50" r={r} fill={`url(#${aoId})`} />
      <circle cx="50" cy="50" r={r} fill={`url(#${rimId})`} />
      <circle cx="50" cy="50" r={r} fill={`url(#${specSoftId})`} />
      <circle cx="50" cy="50" r={r} fill={`url(#${specId})`} />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.14)"
        strokeWidth="0.45"
      />
    </svg>
  );
}
