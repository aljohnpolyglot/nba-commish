const LEGACY_STAFF_IMAGE_MAX = 948;
const STAFF_FOTOGRADE_MAX = 109;
const STAFF_FOTOGRADE_BASE =
  'https://raw.githubusercontent.com/aljohnpolyglot/ng-staff-fotograde/refs/heads/main/stafffaces_fotograde';

export function getStaffImageUrl(staffImageId: number | undefined | null): string | null {
  if (staffImageId == null || staffImageId < 1 || staffImageId > LEGACY_STAFF_IMAGE_MAX) return null;
  if (staffImageId <= STAFF_FOTOGRADE_MAX) {
    return `${STAFF_FOTOGRADE_BASE}/${encodeURIComponent(`Arab (${staffImageId}).png`)}`;
  }
  return `/img/staff/Staff${staffImageId}.png`;
}

export function randomStaffImageId(rng?: () => number): number {
  const roll = rng ? rng() : Math.random();
  return Math.floor(roll * STAFF_FOTOGRADE_MAX) + 1;
}

/** Stable staff portrait from a name string — same name always maps to the same image. */
export function deterministicStaffImageId(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % STAFF_FOTOGRADE_MAX) + 1;
}

/** Single source of truth for portrait resolution. Existing ID wins; otherwise
 *  hash the name. Never returns null and never returns random — same person
 *  always gets the same portrait across modal/card/save/reload. */
export function resolveStaffImageId(person: { staffImageId?: number | null; name?: string | null }): number {
  const id = person.staffImageId;
  if (typeof id === 'number' && id >= 1 && id <= LEGACY_STAFF_IMAGE_MAX) return id;
  return deterministicStaffImageId(person.name ?? '');
}
