import { describe, it, expect } from 'vitest';
import { mapSetupTierToTycoonTier, getTycoonTierUILabel } from '../tierMapping';

describe('mapSetupTierToTycoonTier', () => {
  it('maps Powerhouse -> S', () => {
    expect(mapSetupTierToTycoonTier('Powerhouse')).toBe('S');
  });
  it('maps Established -> A', () => {
    expect(mapSetupTierToTycoonTier('Established')).toBe('A');
  });
  it('maps MidTier -> B', () => {
    expect(mapSetupTierToTycoonTier('MidTier')).toBe('B');
  });
  it('maps Underdog -> C', () => {
    expect(mapSetupTierToTycoonTier('Underdog')).toBe('C');
  });
});

describe('getTycoonTierUILabel', () => {
  it('returns Powerhouse for S', () => {
    expect(getTycoonTierUILabel('S')).toBe('Powerhouse');
  });
  it('returns Lower-Tier for D', () => {
    expect(getTycoonTierUILabel('D')).toBe('Lower-Tier');
  });
});
