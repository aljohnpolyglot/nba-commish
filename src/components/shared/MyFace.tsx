import type { CSSProperties } from 'react';
import type { FaceConfig as FacesJsFaceConfig, Overrides } from 'facesjs';
import { Face } from 'facesjs/react';

const BASKETBALL_JERSEY_IDS = new Set(['jersey', 'jersey2', 'jersey3', 'jersey4', 'jersey5']);
const ALLOWED_ACCESSORY_IDS = new Set(['none', 'headband', 'headband-high']);

type SimpleHairStyle = 'short' | 'curly' | 'afro' | 'fade' | 'long' | 'bun' | 'ponytail';
type SimpleEyeType = 'normal' | 'happy' | 'star' | 'determined';
type SimpleFacialHair = 'none' | 'beard' | 'goatee' | 'stubble';

export interface SimpleFaceConfig {
  skinTone: string;
  hairStyle: SimpleHairStyle;
  hairColor?: string;
  eyeType?: SimpleEyeType;
  facialHair?: SimpleFacialHair;
  headband?: boolean;
  headbandColor?: string;
}

export interface MyFaceProps {
  face?: unknown;
  colors?: [string, string, string];
  jersey?: string;
  lazy?: boolean;
  style?: CSSProperties;
  className?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isSimpleFaceConfig = (face: unknown): face is SimpleFaceConfig => (
  isObject(face)
  && typeof face.skinTone === 'string'
  && typeof face.hairStyle === 'string'
);

const isFacesJsConfig = (face: unknown): face is FacesJsFaceConfig => (
  isObject(face) && 'body' in face && 'head' in face
);

export const isRealFaceConfig = (
  face: unknown,
): face is SimpleFaceConfig | FacesJsFaceConfig => isSimpleFaceConfig(face) || isFacesJsConfig(face);

function SimpleFace({
  face,
  style,
  className,
}: {
  face?: SimpleFaceConfig;
  style?: CSSProperties;
  className?: string;
}) {
  const {
    skinTone = '#f5c396',
    hairStyle = 'short',
    hairColor = '#1e1e1e',
    eyeType = 'normal',
    facialHair = 'none',
    headband = false,
    headbandColor = '#ef4444',
  } = face ?? {};

  return (
    <svg viewBox="0 0 100 100" style={style} className={`h-full w-full ${className ?? ''}`}>
      <circle cx="50" cy="50" r="44" fill={skinTone} />
      <circle cx="8" cy="50" r="7" fill={skinTone} />
      <circle cx="92" cy="50" r="7" fill={skinTone} />

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

      <path d="M 30 34 Q 37 30 44 34" stroke={hairColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 56 34 Q 63 30 70 34" stroke={hairColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 50 44 Q 47 54 52 55" stroke="rgba(0,0,0,0.25)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 36 68 Q 50 82 64 68" stroke="#0f172a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 39 68 Q 50 78 61 68" fill="#e11d48" opacity="0.6" />

      {facialHair === 'beard' && (
        <path d="M 20 52 Q 50 92 80 52 C 75 80, 25 80, 20 52" fill={hairColor} opacity="0.9" />
      )}
      {facialHair === 'goatee' && (
        <path d="M 40 64 Q 50 86 60 64 Q 50 72 40 64" fill={hairColor} opacity="0.9" />
      )}
      {facialHair === 'stubble' && (
        <path d="M 26 58 Q 50 85 74 58" stroke={hairColor} strokeWidth="6" strokeDasharray="1 3" fill="none" opacity="0.4" />
      )}

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
      {hairStyle === 'afro' && <circle cx="50" cy="30" r="34" fill={hairColor} />}
      {hairStyle === 'fade' && (
        <path d="M 16 35 Q 50 12 84 35 L 84 25 Q 50 10 16 25 Z" fill={hairColor} />
      )}
      {hairStyle === 'long' && (
        <path d="M 10 30 Q 50 6 90 30 C 95 65, 80 90, 78 95 C 65 70, 75 35, 50 25 C 25 35, 35 70, 22 95 C 20 90, 5 65, 10 30 Z" fill={hairColor} />
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

      {headband && (
        <rect x="8" y="24" width="84" height="12" rx="4" fill={headbandColor} stroke="#ffffff" strokeWidth="1" />
      )}
    </svg>
  );
}

export function MyFace({
  face,
  colors,
  jersey,
  lazy,
  style,
  className,
}: MyFaceProps) {
  if (!isFacesJsConfig(face)) {
    return <SimpleFace face={isSimpleFaceConfig(face) ? face : undefined} style={style} className={className} />;
  }

  const overrides: Overrides = {};
  if (colors) overrides.teamColors = colors;

  const currentJerseyId = face.jersey?.id;
  const safeJerseyId = jersey ?? (
    currentJerseyId && BASKETBALL_JERSEY_IDS.has(currentJerseyId)
      ? currentJerseyId
      : 'jersey'
  );
  overrides.jersey = { id: safeJerseyId };

  const currentAccessoryId = face.accessories?.id;
  if (!currentAccessoryId || !ALLOWED_ACCESSORY_IDS.has(currentAccessoryId)) {
    overrides.accessories = { id: 'none' };
  }

  return (
    <Face
      face={face}
      ignoreDisplayErrors
      lazy={lazy}
      overrides={overrides}
      style={{ aspectRatio: '2/3', ...(style ?? {}) }}
      className={className}
    />
  );
}
