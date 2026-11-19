import { NotFoundException } from '@nestjs/common';

/**
 * Staff can be tied to one branch. Owners never are. Returns the branch a request must stay
 * inside, or null when the user may see every branch.
 */
export function staffBranch(user: unknown): string | null {
  const u = user as { role?: string; branchId?: string | null } | undefined;
  if (!u || u.role === 'OWNER') return null;
  return u.branchId || null;
}

/**
 * Throws when a branch-bound user touches a record of another branch. Answers 404, not 403, so a
 * record outside the caller's scope cannot be told apart from one that does not exist.
 */
export function assertSameBranch(recordBranchId: string | null | undefined, user: unknown): void {
  const b = staffBranch(user);
  if (b && recordBranchId !== b) {
    throw new NotFoundException('Yozuv topilmadi');
  }
}
