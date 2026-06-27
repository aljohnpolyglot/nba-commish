import React from 'react';

type EventIconProps = {
  name: string;
  className?: string;
};

function IconSvg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function EventIcon({ name, className = '' }: EventIconProps) {
  const lower = name.toLowerCase();

  if (lower.includes('jump')) {
    return (
      <IconSvg className={className}>
        <path d="M14 76C27 61 41 55 55 60C67 64 75 75 86 82" strokeWidth="4" strokeDasharray="6 7" {...stroke} />
        <path d="M17 82C36 70 56 66 81 70" strokeWidth="4" {...stroke} />
        <circle cx="31" cy="31" r="7" fill="currentColor" />
        <path d="M21 47C31 36 44 35 58 42" strokeWidth="8" {...stroke} />
        <path d="M57 42C67 43 76 38 84 29" strokeWidth="7" {...stroke} />
        <path d="M43 43L34 61L24 75" strokeWidth="8" {...stroke} />
        <path d="M44 52L63 58L78 69" strokeWidth="8" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('throw') || lower.includes('shot put') || lower.includes('discus') || lower.includes('javelin') || lower.includes('hammer')) {
    return (
      <IconSvg className={className}>
        <path d="M19 83H76" strokeWidth="4" {...stroke} />
        <path d="M52 62C62 45 76 36 91 32" strokeWidth="4" strokeDasharray="5 7" {...stroke} />
        <circle cx="91" cy="32" r="7" stroke="currentColor" strokeWidth="4" />
        <circle cx="45" cy="27" r="8" fill="currentColor" />
        <circle cx="19" cy="45" r="7" fill="currentColor" />
        <path d="M26 43C40 35 55 31 75 31" strokeWidth="7" {...stroke} />
        <path d="M45 40L43 61L37 76" strokeWidth="8" {...stroke} />
        <path d="M45 47L61 57L60 77" strokeWidth="8" {...stroke} />
        <path d="M43 47L28 62L17 76" strokeWidth="8" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('swim')) {
    return (
      <IconSvg className={className}>
        <path d="M13 69C23 62 33 62 43 69C53 76 63 76 73 69C81 63 88 63 94 67" strokeWidth="5" {...stroke} />
        <path d="M11 81C21 74 31 74 41 81C51 88 61 88 71 81C79 75 87 75 93 79" strokeWidth="5" {...stroke} />
        <circle cx="62" cy="42" r="9" fill="currentColor" />
        <path d="M18 62C31 56 42 47 51 35C55 30 61 29 67 34" strokeWidth="8" {...stroke} />
        <path d="M50 35C42 32 35 32 27 37" strokeWidth="5" {...stroke} />
        <path d="M80 54C86 48 90 45 93 44" strokeWidth="5" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('tug')) {
    return (
      <IconSvg className={className}>
        <path d="M13 82H87" strokeWidth="4" {...stroke} />
        <path d="M25 58H75" strokeWidth="5" {...stroke} />
        <circle cx="50" cy="58" r="4" fill="currentColor" />
        <circle cx="25" cy="38" r="7" fill="currentColor" />
        <path d="M23 48L34 58L43 58" strokeWidth="7" {...stroke} />
        <path d="M24 55L16 70" strokeWidth="7" {...stroke} />
        <path d="M33 58L40 76" strokeWidth="7" {...stroke} />
        <path d="M14 69C13 60 17 53 25 49" strokeWidth="4" {...stroke} />
        <circle cx="75" cy="38" r="7" fill="currentColor" />
        <path d="M77 48L66 58L57 58" strokeWidth="7" {...stroke} />
        <path d="M76 55L84 70" strokeWidth="7" {...stroke} />
        <path d="M67 58L60 76" strokeWidth="7" {...stroke} />
        <path d="M86 69C87 60 83 53 75 49" strokeWidth="4" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('sumo')) {
    return (
      <IconSvg className={className}>
        <path d="M16 73C33 62 67 62 84 73" strokeWidth="4" {...stroke} />
        <circle cx="38" cy="34" r="6" fill="currentColor" />
        <path d="M39 25C34 21 32 18 35 15" strokeWidth="4" {...stroke} />
        <path d="M35 42C27 49 27 62 36 69" strokeWidth="6" {...stroke} />
        <path d="M37 43C45 45 49 52 48 61" strokeWidth="6" {...stroke} />
        <path d="M36 69L29 80" strokeWidth="6" {...stroke} />
        <path d="M45 66L54 76" strokeWidth="6" {...stroke} />
        <path d="M34 53L26 65" strokeWidth="5" {...stroke} />
        <circle cx="62" cy="34" r="6" fill="currentColor" />
        <path d="M61 25C66 21 68 18 65 15" strokeWidth="4" {...stroke} />
        <path d="M65 42C73 49 73 62 64 69" strokeWidth="6" {...stroke} />
        <path d="M63 43C55 45 51 52 52 61" strokeWidth="6" {...stroke} />
        <path d="M64 69L71 80" strokeWidth="6" {...stroke} />
        <path d="M55 66L46 76" strokeWidth="6" {...stroke} />
        <path d="M66 53L74 65" strokeWidth="5" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('climb')) {
    return (
      <IconSvg className={className}>
        <path d="M60 12V89" strokeWidth="4" {...stroke} />
        <circle cx="44" cy="31" r="7" fill="currentColor" />
        <path d="M47 40L57 52L49 69" strokeWidth="8" {...stroke} />
        <path d="M56 51L68 39" strokeWidth="7" {...stroke} />
        <path d="M48 47L34 58" strokeWidth="7" {...stroke} />
        <path d="M50 69L39 84" strokeWidth="8" {...stroke} />
        <path d="M50 69L60 86" strokeWidth="8" {...stroke} />
        <path d="M76 27H86" strokeWidth="6" {...stroke} />
        <circle cx="86" cy="27" r="3" fill="currentColor" />
        <path d="M76 48H86" strokeWidth="6" {...stroke} />
        <circle cx="86" cy="48" r="3" fill="currentColor" />
        <path d="M76 70H86" strokeWidth="6" {...stroke} />
        <circle cx="86" cy="70" r="3" fill="currentColor" />
      </IconSvg>
    );
  }

  if (lower.includes('marathon')) {
    return (
      <IconSvg className={className}>
        <path d="M34 83C57 82 73 75 73 66C73 57 56 54 39 56" strokeWidth="4" {...stroke} />
        <path d="M62 84C82 78 91 69 89 61C87 52 72 49 57 51" strokeWidth="4" {...stroke} />
        <path d="M62 48H91" strokeWidth="4" {...stroke} />
        <path d="M66 48V35H75V48" strokeWidth="4" {...stroke} />
        <path d="M75 48V28H82V48" strokeWidth="4" {...stroke} />
        <path d="M82 48V38H90V48" strokeWidth="4" {...stroke} />
        <circle cx="45" cy="31" r="7" fill="currentColor" />
        <path d="M37 43L50 52L61 47" strokeWidth="8" {...stroke} />
        <path d="M41 52L32 66L22 79" strokeWidth="8" {...stroke} />
        <path d="M43 53L52 69L51 85" strokeWidth="8" {...stroke} />
        <path d="M37 43L28 55" strokeWidth="8" {...stroke} />
      </IconSvg>
    );
  }

  if (lower.includes('run') || lower.includes('sprint')) {
    return (
      <IconSvg className={className}>
        <path d="M12 82H82" strokeWidth="4" strokeDasharray="7 9" {...stroke} />
        <path d="M10 51H28" strokeWidth="4" {...stroke} />
        <path d="M10 61H24" strokeWidth="4" {...stroke} />
        <path d="M12 40H32" strokeWidth="4" {...stroke} />
        <circle cx="56" cy="25" r="8" fill="currentColor" />
        <path d="M43 39L56 48L68 42" strokeWidth="8" {...stroke} />
        <path d="M48 48L34 63L22 78" strokeWidth="8" {...stroke} />
        <path d="M50 49L62 63L77 55" strokeWidth="8" {...stroke} />
        <path d="M42 40L33 50" strokeWidth="8" {...stroke} />
      </IconSvg>
    );
  }

  return (
    <IconSvg className={className}>
      <circle cx="25" cy="40" r="15" stroke="currentColor" strokeWidth="5" />
      <circle cx="50" cy="40" r="15" stroke="currentColor" strokeWidth="5" />
      <circle cx="75" cy="40" r="15" stroke="currentColor" strokeWidth="5" />
      <circle cx="37.5" cy="60" r="15" stroke="currentColor" strokeWidth="5" />
      <circle cx="62.5" cy="60" r="15" stroke="currentColor" strokeWidth="5" />
    </IconSvg>
  );
}
