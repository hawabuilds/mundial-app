import { buildFootballArtwork, FOOTBALL_CLIP_RADIUS } from "./soccerBallGeometry";

type SoccerBallGraphicProps = {
  idPrefix: string;
  className?: string;
};

/** Telstar football — centre pent, five outer caps, white hex gaps (icon-readable). */
export default function SoccerBallGraphic({
  idPrefix,
  className,
}: SoccerBallGraphicProps) {
  const clipId = `${idPrefix}-clip`;
  const sphereId = `${idPrefix}-sphere`;
  const shadowId = `${idPrefix}-shadow`;
  const specId = `${idPrefix}-spec`;
  const panelShadeId = `${idPrefix}-panel-shade`;
  const rimId = `${idPrefix}-rim`;

  const { panels, seams, stitches } = buildFootballArtwork();
  const clipR = FOOTBALL_CLIP_RADIUS;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={sphereId} cx="34%" cy="28%" r="68%" fx="30%" fy="24%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="38%" stopColor="#f7f7f7" />
          <stop offset="72%" stopColor="#e3e3e3" />
          <stop offset="100%" stopColor="#a8a8a8" />
        </radialGradient>

        <radialGradient id={shadowId} cx="68%" cy="72%" r="52%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.38)" />
          <stop offset="55%" stopColor="rgba(0,0,0,0.12)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        <radialGradient id={specId} cx="28%" cy="22%" r="38%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        <linearGradient id={panelShadeId} x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#242424" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>

        <radialGradient id={rimId} cx="50%" cy="50%" r="50%">
          <stop offset="92%" stopColor="rgba(0,0,0,0)" />
          <stop offset="97%" stopColor="rgba(0,0,0,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>

        <clipPath id={clipId}>
          <circle cx="50" cy="50" r={clipR} />
        </clipPath>
      </defs>

      <circle cx="50" cy="50" r={clipR} fill={`url(#${sphereId})`} />
      <circle cx="50" cy="50" r={clipR} fill={`url(#${shadowId})`} />

      <g clipPath={`url(#${clipId})`}>
        {panels.map((path, index) => (
          <path key={`panel-${index}`} d={path} fill={`url(#${panelShadeId})`} />
        ))}

        <g
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {stitches.map((path, index) => (
            <path key={`stitch-${index}`} d={path} />
          ))}
        </g>

        <g
          fill="none"
          stroke="#080808"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {seams.map((path, index) => (
            <path key={`seam-${index}`} d={path} />
          ))}
        </g>
      </g>

      <circle cx="50" cy="50" r={clipR} fill={`url(#${specId})`} />
      <circle cx="50" cy="50" r={clipR} fill={`url(#${rimId})`} />
      <circle
        cx="50"
        cy="50"
        r={clipR}
        fill="none"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="0.9"
      />
    </svg>
  );
}
