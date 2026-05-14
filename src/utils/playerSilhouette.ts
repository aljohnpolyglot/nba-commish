// Generic person-silhouette data URI used as last-resort fallback when a
// player has neither a real photo nor a facesjs config. Replaces the previous
// picsum.photos fallback which returned random landscape photos (mountains,
// sea) for players without imagery — visually nonsensical in player UIs.

const SILHOUETTE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1f2937"/>
  <g fill="#475569">
    <circle cx="100" cy="78" r="34"/>
    <path d="M40 200 C 40 138, 65 118, 100 118 C 135 118, 160 138, 160 200 Z"/>
  </g>
</svg>
`.trim();

export const PLAYER_SILHOUETTE_DATA_URI =
  `data:image/svg+xml;utf8,${encodeURIComponent(SILHOUETTE_SVG)}`;
