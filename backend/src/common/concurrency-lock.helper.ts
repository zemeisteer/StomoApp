/**
 * Shared concurrency locking helper for PostgreSQL transactional advisory locks.
 * Guarantees deterministic ascending acquisition order to eliminate deadlocks.
 */

export function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function getDoctorLockKey(doctorId: string): number {
  return hashStringToInt(`doc_${doctorId}`);
}

export function getBranchLockKey(branchId: string): number {
  return hashStringToInt(`branch_${branchId}`);
}

/**
 * Acquires advisory locks in strictly ascending numerical order.
 * Mathematical property: Identical sorted order across all transactions
 * guarantees deadlock-free serialization.
 */
export async function acquireDeterministicLocks(
  tx: any,
  keys: (number | null | undefined)[],
): Promise<number[]> {
  const validKeys = keys.filter((k): k is number => typeof k === 'number' && Number.isFinite(k));
  const uniqueSorted = Array.from(new Set(validKeys)).sort((a, b) => a - b);
  for (const key of uniqueSorted) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  }
  return uniqueSorted;
}
