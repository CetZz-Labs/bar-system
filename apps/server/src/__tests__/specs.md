# SDD Delta Specs: Vitest Test Coverage Setup

## Overview

This spec defines test requirements for adding Vitest test coverage to `la-banda-server`. Covers infrastructure setup, utility functions, and middleware testing with Given/When/Then scenarios.

---

## 1. vitest.config.ts — Infrastructure Configuration

### Requirement: Vitest must be configured to run tests in Node environment with proper coverage settings

**Scenario 1: Configuration loads successfully**
- Given the project has `vitest.config.ts` in the root directory
- When Vitest starts
- Then it should load configuration without errors

**Scenario 2: Test files are discovered**
- Given test files exist at `src/**/*.test.ts`
- When `vitest run` is executed
- Then all test files matching the pattern should be discovered and executed

**Scenario 3: Coverage is generated**
- Given tests have run successfully
- When `vitest run --coverage` is executed
- Then coverage reports should be generated in `coverage/` directory

**Scenario 4: Coverage excludes test files**
- Given coverage configuration exists
- When coverage is calculated
- Then `src/**/*.test.ts` files should be excluded from coverage metrics

**Edge Cases:**
- If no test files exist, Vitest should exit cleanly with 0 tests run
- If `node_modules` contains `.ts` files, they should not be included

**Mocking Requirements:**
- None — configuration test validates file existence and structure

---

## 2. src/__tests__/setup.ts — Global Test Setup

### Requirement: Test environment variables must be configured before any test runs

**Scenario 1: JWT_SECRET is set**
- Given the test setup file is loaded
- When any test module imports `jsonwebtoken`
- Then `process.env.JWT_SECRET` should equal `'test-secret-key-for-testing'`

**Scenario 2: SALT_ROUNDS is set**
- Given the test setup file is loaded
- When any test module imports `bcrypt`
- Then `process.env.SALT_ROUNDS` should equal `'4'`

**Scenario 3: NODE_ENV is set to test**
- Given the test setup file is loaded
- When server-side code checks `process.env.NODE_ENV`
- Then it should equal `'test'`

**Edge Cases:**
- If `.env` file exists, test env vars should override production values
- If setup file fails to load, tests should fail with clear error message

**Mocking Requirements:**
- None — setup file configures environment, doesn't mock

---

## 3. src/utils/__tests__/auth.test.ts — Password Hashing Utilities

### Requirement: hashPassword must generate secure bcrypt hashes

**Scenario 1: Hash is generated successfully**
- Given a plaintext password `'mypassword123'`
- When `hashPassword('mypassword123')` is called
- Then it should return a string
- And the string should start with `$2b$` (bcrypt prefix)
- And the string should be approximately 60 characters long

**Scenario 2: Same input produces different hashes (salt uniqueness)**
- Given two calls to `hashPassword` with the same password `'samepassword'`
- When both hashes are generated
- Then the two hashes should be different strings
- But both should start with `$2b$`

**Scenario 3: Empty string is handled**
- Given an empty password `''`
- When `hashPassword('')` is called
- Then it should return a valid bcrypt hash without throwing

**Scenario 4: Very long password is handled**
- Given a 1000-character string
- When `hashPassword(longString)` is called
- Then it should return a valid bcrypt hash (bcrypt truncates at 72 bytes)

### Requirement: checkPassword must validate passwords against hashes

**Scenario 5: Correct password returns true**
- Given a stored hash from `hashPassword('correctpassword')`
- When `checkPassword('correctpassword', storedHash)` is called
- Then it should return `true`

**Scenario 6: Incorrect password returns false**
- Given a stored hash from `hashPassword('correctpassword')`
- When `checkPassword('wrongpassword', storedHash)` is called
- Then it should return `false`

**Scenario 7: Empty password check works**
- Given a hash from `hashPassword('')`
- When `checkPassword('', hash)` is called
- Then it should return `true`

**Scenario 8: Non-existent hash comparison**
- Given a random hash string `'$2b$10$invalidhash'`
- When `checkPassword('password', invalidHash)` is called
- Then it should return `false` (not throw)

**Edge Cases:**
- `hashPassword` with special characters (`!@#$%^&*()`) should work
- `hashPassword` with Unicode characters should work
- `checkPassword` should be timing-safe (bcrypt handles this internally)
- If `SALT_ROUNDS` env var is not set, default to 10 (test setup ensures it's 4)

**Mocking Requirements:**
- No mocking — use real bcrypt with low `SALT_ROUNDS=4` for speed
- Environment variables set in setup.ts

---

## 4. src/utils/__tests__/jwt.test.ts — JWT Token Generation

### Requirement: generateJWT must produce valid JSON Web Tokens

**Scenario 1: Token is generated successfully**
- Given a valid payload `{ id: new Types.ObjectId() }`
- When `generateJWT(payload)` is called
- Then it should return a string
- And the string should contain two dots (JWT format: header.payload.signature)

**Scenario 2: Token can be verified**
- Given a generated token from `generateJWT(payload)`
- When `jwt.verify(token, process.env.JWT_SECRET)` is called
- Then it should decode without throwing
- And the decoded payload should contain the original `id`

**Scenario 3: Token has correct expiry**
- Given a generated token
- When the token is decoded
- Then `exp` claim should be set
- And `exp - iat` should be approximately 15 days (in seconds)

**Scenario 4: Token is invalid with wrong secret**
- Given a generated token
- When `jwt.verify(token, 'wrong-secret')` is called
- Then it should throw `JsonWebTokenError`

**Scenario 5: Empty payload object throws**
- Given an empty object `{}`
- When `generateJWT({} as UserPayLoad)` is called
- Then it should throw or produce an invalid token (missing `id` field)

**Edge Cases:**
- Token with `id: new Types.ObjectId('000000000000000000000000')` should work
- Token generation should be synchronous (no async/await needed)
- If `JWT_SECRET` env var is not set, `jwt.sign` will throw

**Mocking Requirements:**
- No mocking — use real `jsonwebtoken` with `JWT_SECRET=test-secret-key-for-testing`
- Verify tokens with real `jwt.verify` to ensure round-trip correctness
- Optional: mock `jwt.sign` for unit testing error paths

---

## 5. src/utils/__tests__/token.test.ts — Token Generation

### Requirement: generateToken must produce 6-digit numeric strings

**Scenario 1: Token is a 6-digit string**
- Given no input
- When `generateToken()` is called
- Then it should return a string
- And the string should have length 6
- And the string should consist only of digits

**Scenario 2: Token is in valid range**
- Given multiple calls to `generateToken()`
- When each result is parsed as an integer
- Then each value should be >= 100000
- And each value should be <= 999999

**Scenario 3: Token is a string, not a number**
- Given no input
- When `generateToken()` is called
- Then `typeof result` should be `'string'`

**Scenario 4: Tokens vary across calls**
- Given 100 calls to `generateToken()`
- When all results are collected
- Then at least 2 different values should exist (probability near 1)

**Edge Cases:**
- `Math.random()` could theoretically return same value twice — not a bug
- Token format must be exactly 6 digits, no leading zeros possible (100000 minimum)

**Mocking Requirements:**
- No mocking — pure function, no dependencies
- Optional: mock `Math.random` to test specific output values

---

## 6. src/middleware/__tests__/validation.test.ts — Input Validation Middleware

### Requirement: handleInputErrors must check express-validator results

**Scenario 1: Validation errors return 400**
- Given `req` with validation errors (mock `validationResult` to return `{ isEmpty: () => false, array: () => [...] }`)
- When `handleInputErrors(req, res, next)` is called
- Then `res.status` should be called with `400`
- And `res.json` should be called with `{ errors: [...] }`
- And `next` should NOT be called

**Scenario 2: No validation errors calls next**
- Given `req` with no validation errors (mock `validationResult` to return `{ isEmpty: () => true }`)
- When `handleInputErrors(req, res, next)` is called
- Then `res.status` should NOT be called
- And `res.json` should NOT be called
- And `next` should be called once

**Scenario 3: Empty errors array calls next**
- Given `req` with empty errors array (mock `validationResult` to return `{ isEmpty: () => true, array: () => [] }`)
- When `handleInputErrors(req, res, next)` is called
- Then `next` should be called

**Scenario 4: Multiple errors are returned**
- Given `req` with 3 validation errors
- When `handleInputErrors(req, res, next)` is called
- Then `res.json` should be called with `{ errors: arrayWithLength3 }`
- And all 3 errors should be in the response

**Edge Cases:**
- `validationResult` returning `null` or `undefined` should be handled
- `res.status().json()` chaining should work correctly
- Middleware should not modify `req` object

**Mocking Requirements:**
- **Must mock**: `express-validator` module — specifically `validationResult` function
- Mock strategy: `vi.mock('express-validator', () => ({ validationResult: vi.fn() }))`
- Control mock return value in each test with `mockReturnValue` or `mockImplementation`

---

## 7. src/middleware/__tests__/auth.test.ts — Authentication Middleware

### Requirement: authenticate must verify JWT tokens and check user roles

**Scenario 1: No token returns 401**
- Given `req.cookies.access_token` is `undefined`
- When `authenticate()(req, res, next)` is called
- Then `res.status` should be called with `401`
- And `res.json` should be called with `{ message: 'No Autorizado' }`
- And `next` should NOT be called

**Scenario 2: Invalid token returns 500**
- Given `req.cookies.access_token` is `'invalid-token'`
- When `authenticate()(req, res, next)` is called
- Then `res.status` should be called with `500`
- And `res.json` should be called with `{ message: 'Token No Válido o expirado' }`
- And `next` should NOT be called

**Scenario 3: Valid token but user not found returns 401**
- Given a valid JWT token decoded to `{ id: validObjectId }`
- And `User.findById().select()` returns `null`
- When `authenticate()(req, res, next)` is called
- Then `res.status` should be called with `401`
- And `res.json` should be called with `{ message: 'Token No Válido o usuario inexistente' }`

**Scenario 4: Valid token but user inactive returns 401**
- Given a valid JWT token decoded to `{ id: validObjectId }`
- And `User.findById().select()` returns user with `isActive: false`
- When `authenticate()(req, res, next)` is called
- Then `res.status` should be called with `401`
- And `res.json` should be called with `{ message: 'La cuenta está desactivada' }`

**Scenario 5: Valid token but role not allowed returns 403**
- Given a valid JWT token decoded to `{ id: validObjectId }`
- And `User.findById().select()` returns user with `role: 'USER'`
- And `allowedRoles` is `['ADMIN']`
- When `authenticate(['ADMIN'])(req, res, next)` is called
- Then `res.status` should be called with `403`
- And `res.json` should be called with `{ message: 'Acceso Denegado: No tienes los permisos necesarios' }`

**Scenario 6: Valid token with allowed role calls next**
- Given a valid JWT token decoded to `{ id: validObjectId }`
- And `User.findById().select()` returns user with `role: 'ADMIN'`
- And `allowedRoles` is `['ADMIN']`
- When `authenticate(['ADMIN'])(req, res, next)` is called
- Then `req.user` should be set to the user object
- And `next` should be called

**Scenario 7: Default role is USER**
- Given `authenticate()` called without arguments
- When a user with `role: 'USER'` authenticates
- Then `next` should be called (USER is in default allowed roles)

**Scenario 8: Multiple allowed roles work**
- Given `authenticate(['ADMIN', 'USER'])` called
- And user has `role: 'USER'`
- When `authenticate()(req, res, next)` is called
- Then `next` should be called

**Edge Cases:**
- Token with expired `exp` claim should trigger catch block (returns 500)
- Token with `id: undefined` after decode should trigger the `if (decoded && decoded.id)` check
- `User.findById` throwing error should trigger catch block
- `console.error` is called in catch block — verify with spy
- `req.user` assignment should happen only on success path
- `allowedRoles` array can be empty — should deny all users

**Mocking Requirements:**
- **Must mock**: `jsonwebtoken` module — `jwt.verify` function
- **Must mock**: `../models/User` module — `User.findById().select()` chain
- **Mock strategy for User model**: 
  ```typescript
  vi.mock('../../models/User', () => ({
    default: {
      findById: vi.fn().mockReturnThis(),
      select: vi.fn()
    }
  }))
  ```
- **Mock strategy for JWT**:
  ```typescript
  vi.mock('jsonwebtoken', () => ({
    default: {
      verify: vi.fn()
    }
  }))
  ```
- **Request/Response mocks**: Create mock objects for `req`, `res`, `next`
  - `req.cookies = { access_token: 'token' }`
  - `res.status = vi.fn().mockReturnThis()`
  - `res.json = vi.fn()`
  - `next = vi.fn()`

---

## 8. src/__tests__/helpers/mockHelpers.ts — Test Utilities

### Requirement: Reusable mock factories for request/response objects

**Scenario 1: Create mock request**
- Given `createMockRequest({ cookies: { access_token: 'token' } })`
- When called
- Then it should return object with `cookies`, `user`, and other Express Request properties

**Scenario 2: Create mock response**
- Given `createMockResponse()`
- When called
- Then it should return object with `status` and `json` methods that are spies
- And `status` should return `this` for chaining

**Scenario 3: Create mock next function**
- Given `createMockNext()`
- When called
- Then it should return a `vi.fn()` spy

**Edge Cases:**
- Default values should be provided for optional properties
- Spies should be reset between tests (use `beforeEach`)

**Mocking Requirements:**
- Uses `vi.fn()` for all spy functions
- No external dependencies to mock

---

## Coverage Targets

| Module | Target | Justification |
|--------|--------|---------------|
| src/utils/auth.ts | 100% | Pure functions, easy to test |
| src/utils/jwt.ts | 100% | Pure function, no side effects |
| src/utils/token.ts | 100% | Pure function, one line |
| src/middleware/validation.ts | 100% | Simple branching logic |
| src/middleware/auth.ts | 90% | Complex branching, DB mocking |
| **Overall** | **>90%** | First slice coverage |

---

## Test Execution Order

1. Setup files load correctly
2. Utility functions (no dependencies)
3. Validation middleware (mock express-validator)
4. Auth middleware (mock JWT + User model)

---

## Risks Identified

| Risk | Impact | Mitigation |
|------|--------|------------|
| bcrypt slow even with SALT_ROUNDS=4 | Tests take >30s | Use SALT_ROUNDS=4, avoid excessive hashing |
| server.ts side effects on import | Tests crash | Never import server.ts directly |
| JWT_SECRET undefined in tests | Auth tests fail | Set in setup.ts with fallback |
| User model mock chain complexity | Brittle tests | Use vi.mock with mockReturnThis pattern |
| express-validator mock leaking between tests | Flaky tests | Reset mocks in beforeEach |

---

## Files to Create (Spec Only, No Implementation)

1. `vitest.config.ts` — Vitest configuration
2. `src/__tests__/setup.ts` — Global test setup
3. `src/__tests__/helpers/mockHelpers.ts` — Mock factories
4. `src/utils/__tests__/auth.test.ts` — Auth utility tests
5. `src/utils/__tests__/jwt.test.ts` — JWT utility tests
6. `src/utils/__tests__/token.test.ts` — Token utility tests
7. `src/middleware/__tests__/validation.test.ts` — Validation middleware tests
8. `src/middleware/__tests__/auth.test.ts` — Auth middleware tests
