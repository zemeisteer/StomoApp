/**
 * Money columns are 32-bit integers (max 2 147 483 647). Every amount a client sends is capped
 * below that, so an oversized value is a clean 400 instead of a database error or an overflow.
 */
export const MAX_MONEY = 2_000_000_000;

/** Stock quantities and movements share the same 32-bit column type. */
export const MAX_QUANTITY = 1_000_000;
