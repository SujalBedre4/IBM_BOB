// This file is loaded by Jest via `setupFiles` BEFORE any test module is imported.
// It must set JWT_SECRET here so that auth.ts (which throws at module load if the
// variable is absent) can be safely required by every test suite.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
