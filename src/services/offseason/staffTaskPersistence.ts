import type { OffseasonRowStatus } from '../../types';

interface StaffRetirementReviewPersistenceInput {
  status: OffseasonRowStatus;
  currentIds: readonly string[];
  reviewedIds?: readonly string[];
}

interface StaffRetirementReviewPersistenceResult {
  status: OffseasonRowStatus;
  reviewedIds: string[];
  changed: boolean;
}

export function resolveStaffRetirementReviewPersistence({
  status,
  currentIds,
  reviewedIds,
}: StaffRetirementReviewPersistenceInput): StaffRetirementReviewPersistenceResult {
  const uniqueCurrent = [...new Set(currentIds.filter(Boolean))].sort();
  if (status !== 'done' && status !== 'skipped') {
    return {
      status,
      reviewedIds: reviewedIds ? [...new Set(reviewedIds.filter(Boolean))].sort() : [],
      changed: false,
    };
  }

  if (reviewedIds === undefined) {
    return { status, reviewedIds: uniqueCurrent, changed: true };
  }

  const reviewed = new Set(reviewedIds.filter(Boolean));
  const hasNewRecord = uniqueCurrent.some(id => !reviewed.has(id));
  if (!hasNewRecord) {
    const normalizedReviewed = [...reviewed].sort();
    return {
      status,
      reviewedIds: normalizedReviewed,
      changed: normalizedReviewed.length !== reviewedIds.length,
    };
  }

  return {
    status: 'pending',
    reviewedIds: [...reviewed].sort(),
    changed: true,
  };
}

export function resolveStaffSigningPersistence({
  status,
  retirementStatus,
  openStaffCount,
  delegated = false,
}: {
  status: OffseasonRowStatus;
  retirementStatus: OffseasonRowStatus;
  openStaffCount: number;
  delegated?: boolean;
}): OffseasonRowStatus {
  if (retirementStatus !== 'done' && retirementStatus !== 'skipped') return status;
  if (delegated && (status === 'done' || status === 'skipped')) return status;
  if (openStaffCount > 0 && (status === 'done' || status === 'skipped')) return 'pending';
  return status;
}

export function resolveUnifiedStaffSigningMigration({
  status,
  retirementStatus,
  openStaffCount,
  staffTeamReady,
}: {
  status: OffseasonRowStatus;
  retirementStatus: OffseasonRowStatus;
  openStaffCount: number;
  staffTeamReady: boolean;
}): OffseasonRowStatus {
  if (!staffTeamReady || status !== 'skipped') return status;
  return resolveStaffSigningPersistence({
    status: 'pending',
    retirementStatus,
    openStaffCount,
  });
}
