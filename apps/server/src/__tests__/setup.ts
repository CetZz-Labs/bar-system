/// <reference types="vitest/globals" />
import { vi } from 'vitest'

// ── Environment Variables ──────────────────────────────────────
// Set BEFORE any imports that read process.env
process.env.JWT_SECRET = 'test-jwt-secret-for-testing'
process.env.SALT_ROUNDS = '4'           // bcrypt: 4 rounds = fast (default 10 is slow)
process.env.NODE_ENV = 'test'
// LB-101: Cloudinary — dummy values so config/cloudinary.ts imports cleanly and
// storage.ts builds a deterministic public_id under a known folder in tests.
// The SDK itself is always mocked; these are never used for a real network call.
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
process.env.CLOUDINARY_API_KEY = 'test-key'
process.env.CLOUDINARY_API_SECRET = 'test-secret'
process.env.CLOUDINARY_FOLDER = 'labanda/test'

// ── Global Cleanup ─────────────────────────────────────────────
// afterEach is available globally (globals: true)
afterEach(() => {
  vi.restoreAllMocks()                  // Restores all spied/mock'd functions
  vi.clearAllMocks()                    // Clears call history, instances, results
})