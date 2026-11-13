import { ForbiddenException } from '@nestjs/common';

/**
 * Staff can be tied to one branch. Owners never are. Returns the branch a request must stay
 * inside, or null when the user may see every branch.
 */
export function staffBranch(user: unknown): string | null {
  const u = user as { role?: string; branchId?: string | null } | undefined;
  if (!u || u.role === 'OWNER') return null;
  return u.branchId || null;
}

/** Throws when a branch-bound user touches a record of another branch. */
export function assertSameBranch(recordBranchId: string | null | undefined, user: unknown): void {
  const b = staffBranch(user);
  if (b && recordBranchId !== b) {
    throw new ForbiddenException('Bu yozuv boshqa filialga tegishli');
  }
}
