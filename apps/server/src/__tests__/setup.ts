/// <reference types="vitest/globals" />
import { vi } from 'vitest'

// ── Environment Variables ──────────────────────────────────────
// Set BEFORE any imports that read process.env
process.env.JWT_SECRET = 'test-jwt-secret-for-testing'
process.env.SALT_ROUNDS = '4'           // bcrypt: 4 rounds = fast (default 10 is slow)
process.env.NODE_ENV = 'test'

// ── Global Cleanup ─────────────────────────────────────────────
// afterEach is available globally (globals: true)
afterEach(() => {
  vi.restoreAllMocks()                  // Restores all spied/mock'd functions
  vi.clearAllMocks()                    // Clears call history, instances, results
})