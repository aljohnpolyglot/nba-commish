/**
 * MyFace — basketball-skinned wrapper around facesjs's `<Face>` component.
 * Mirrors ZenGM's MyFace pattern: forces 2:3 aspect ratio (required by facesjs canvas),
 * swallows any face-descriptor errors so stale/partial data doesn't crash the UI, and
 * exposes optional team color overrides for when we do know the drafting team.
 */
import React from 'react';
import { Face } from 'facesjs/react';

const BASKETBALL_JERSEY_IDS = new Set(['jersey', 'jersey2', 'jersey3', 'jersey4', 'jersey5']);
const ALLOWED_ACCESSORY_IDS = new Set(['none', 'headband', 'headband-high']);

export interface MyFaceProps {
  /** facesjs descriptor object. */
  face: any;
  /** Optional: tri-color team palette [primary, secondary, accent] — skips override if absent. */
  colors?: [string, string, string];
  /** Optional: jersey feature id (facesjs pool). Falls back to facesjs default. */
  jersey?: string;
  /** Defer rendering until the element enters the viewport. */
  lazy?: boolean;
  /** Inline style merged onto the wrapper. */
  style?: React.CSSProperties;
}

/** Narrow check so malformed `{race, generated: true}` stubs fall through cleanly. */
export const isRealFaceConfig = (face: any): boolean =>
  !!(face && face.body && face.head);

export const MyFace: React.FC<MyFaceProps> = ({ face, colors, jersey, lazy, style }) => {
  const overrides: Record<string, any> = {};
  if (colors) overrides.teamColors = colors;

  const currentJerseyId = face?.jersey?.id;
  const safeJerseyId = jersey ?? (BASKETBALL_JERSEY_IDS.has(currentJerseyId) ? currentJerseyId : 'jersey');
  overrides.jersey = { id: safeJerseyId };

  const currentAccessoryId = face?.accessories?.id;
  if (!ALLOWED_ACCESSORY_IDS.has(currentAccessoryId)) {
    overrides.accessories = { id: 'none' };
  }

  return (
    <Face
      face={face}
      ignoreDisplayErrors
      lazy={lazy}
      overrides={Object.keys(overrides).length > 0 ? overrides : undefined}
      style={{ aspectRatio: '2/3', ...(style ?? {}) }}
    />
  );
};
