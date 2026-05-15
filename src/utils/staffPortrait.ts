const MAX_STAFF_IMAGE = 948;

export function getStaffImageUrl(staffImageId: number | undefined | null): string | null {
  if (staffImageId == null || staffImageId < 1 || staffImageId > MAX_STAFF_IMAGE) return null;
  return `/img/staff/Staff${staffImageId}.png`;
}

export function randomStaffImageId(rng?: () => number): number {
  const roll = rng ? rng() : Math.random();
  return Math.floor(roll * MAX_STAFF_IMAGE) + 1;
}

/** Stable staff portrait from a name string — same name always maps to the same image. */
export function deterministicStaffImageId(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % MAX_STAFF_IMAGE) + 1;
}
