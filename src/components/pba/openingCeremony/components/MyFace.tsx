import { CSSProperties } from 'react';
import { FaceConfig } from '../types';

export function isRealFaceConfig(face: unknown): face is FaceConfig {
  return (
    typeof face === 'object' &&
    face !== null &&
    'skinTone' in face &&
    'hairStyle' in face
  );
}

interface MyFaceProps {
  face?: unknown;
  style?: CSSProperties;
  className?: string;
}

export function MyFace({ face, style, className }: MyFaceProps) {
  if (!isRealFaceConfig(face)) {
    return (
      <svg viewBox="0 0 100 100" style={style} className={className}>
        <circle cx="50" cy="50" r="45" fill="#f5c396" />
        <circle cx="35" cy="40" r="5" fill="#1e293b" />
        <circle cx="65" cy="40" r="5" fill="#1e293b" />
        <path d="M 35 65 Q 50 80 65 65" stroke="#1e293b" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  const {
    skinTone = '#f5c396',
    hairStyle = 'short',
    hairColor = '#1e1e1e',
    eyeType = 'normal',
    facialHair = 'none',
    headband = false,
    headbandColor = '#ef4444',
  } = face;

  return (
    <svg viewBox="0 0 100 100" style={style} className={`w-full h-full ${className || ''}`}>
      <defs>
        <clipPath id="face-clip">
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>

      {/* Head base */}
      <circle cx="50" cy="50" r="44" fill={skinTone} />

      {/* Ears */}
      <circle cx="8" cy="50" r="7" fill={skinTone} />
      <circle cx="92" cy="50" r="7" fill={skinTone} />

      {/* Eyes */}
      {eyeType === 'happy' ? (
        <>
          <path d="M 30 42 Q 37 34 44 42" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M 56 42 Q 63 34 70 42" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : eyeType === 'star' ? (
        <>
          <text x="37" y="47" fontSize="16" textAnchor="middle" fill="#eab308">★</text>
          <text x="63" y="47" fontSize="16" textAnchor="middle" fill="#eab308">★</text>
        </>
      ) : eyeType === 'determined' ? (
        <>
          <path d="M 30 36 L 44 40" stroke="#0f172a" strokeWidth="3" />
          <path d="M 70 36 L 56 40" stroke="#0f172a" strokeWidth="3" />
          <circle cx="37" cy="44" r="4" fill="#0f172a" />
          <circle cx="63" cy="44" r="4" fill="#0f172a" />
        </>
      ) : (
        <>
          <circle cx="37" cy="42" r="4.5" fill="#0f172a" />
          <circle cx="63" cy="42" r="4.5" fill="#0f172a" />
          <circle cx="38.5" cy="40.5" r="1.5" fill="#ffffff" />
          <circle cx="64.5" cy="40.5" r="1.5" fill="#ffffff" />
        </>
      )}

      {/* Eyebrows */}
      <path d="M 30 34 Q 37 30 44 34" stroke={hairColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 56 34 Q 63 30 70 34" stroke={hairColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* Nose */}
      <path d="M 50 44 Q 47 54 52 55" stroke="rgba(0,0,0,0.25)" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Mouth */}
      <path d="M 36 68 Q 50 82 64 68" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 39 68 Q 50 78 61 68" fill="#e11d48" opacity="0.6" />

      {/* Facial Hair */}
      {facialHair === 'beard' && (
        <path d="M 20 52 Q 50 92 80 52 C 75 80, 25 80, 20 52" fill={hairColor} opacity="0.9" />
      )}
      {facialHair === 'goatee' && (
        <path d="M 40 64 Q 50 86 60 64 Q 50 72 40 64" fill={hairColor} opacity="0.9" />
      )}
      {facialHair === 'stubble' && (
        <path d="M 26 58 Q 50 85 74 58" stroke={hairColor} strokeWidth="6" strokeDasharray="1 3" fill="none" opacity="0.4" />
      )}

      {/* Hair styles */}
      {hairStyle === 'short' && (
        <path d="M 12 40 Q 50 6 88 40 Q 50 16 12 40 Z" fill={hairColor} />
      )}
      {hairStyle === 'curly' && (
        <g fill={hairColor}>
          <circle cx="20" cy="25" r="12" />
          <circle cx="35" cy="18" r="14" />
          <circle cx="50" cy="16" r="15" />
          <circle cx="65" cy="18" r="14" />
          <circle cx="80" cy="25" r="12" />
        </g>
      )}
      {hairStyle === 'afro' && (
        <circle cx="50" cy="30" r="34" fill={hairColor} />
      )}
      {hairStyle === 'fade' && (
        <path d="M 16 35 Q 50 12 84 35 L 84 25 Q 50 10 16 25 Z" fill={hairColor} />
      )}
      {hairStyle === 'long' && (
        <g fill={hairColor}>
          <path d="M 10 30 Q 50 6 90 30 C 95 65, 80 90, 78 95 C 65 70, 75 35, 50 25 C 25 35, 35 70, 22 95 C 20 90, 5 65, 10 30 Z" />
        </g>
      )}
      {hairStyle === 'bun' && (
        <g fill={hairColor}>
          <path d="M 14 38 Q 50 10 86 38 Z" />
          <circle cx="50" cy="8" r="13" />
        </g>
      )}
      {hairStyle === 'ponytail' && (
        <g fill={hairColor}>
          <path d="M 14 38 Q 50 10 86 38 Z" />
          <path d="M 75 25 C 95 35, 95 65, 85 80 C 80 65, 85 45, 75 25 Z" />
        </g>
      )}

      {/* Headband */}
      {headband && (
        <rect x="8" y="24" width="84" height="12" rx="4" fill={headbandColor} stroke="#ffffff" strokeWidth="1" />
      )}
    </svg>
  );
}
