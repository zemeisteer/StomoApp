/**
 * Production is the default. Dev-only shortcuts (codes shown on screen, insecure cookies, free
 * translation endpoint, local upload fallback) run only when NODE_ENV is explicitly `development`,
 * or under the jest runner (`test`). A missing or misspelled NODE_ENV behaves like production.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function isTestRunner(): boolean {
  return process.env.NODE_ENV === 'test';
}

/** True everywhere except an explicit development machine or the test runner. */
export function isProductionLike(): boolean {
  return !isDevelopment() && !isTestRunner();
}
