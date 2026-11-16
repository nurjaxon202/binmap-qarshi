/**
 * Test stub for the `server-only` package, which throws when imported outside
 * a React Server Component. Aliased in vitest.config.mts so the pure logic in
 * server modules (password hashing, for instance) can be tested directly; the
 * real guard stays in place for the application build.
 */
export {};
