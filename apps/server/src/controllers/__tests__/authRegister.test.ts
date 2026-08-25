import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { AuthController } from '../../controllers/AuthController'
import User from '../../models/User'
import Token from '../../models/Token'
import { AuthEmail } from '../../emails/AuthEmail'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}))

// Mock Token model — `new Token()` seguido de asignaciones directas + save().
let lastCreatedToken: any = null
vi.mock('../../models/Token', () => {
  function MockToken() {
    const instance = {
      token: undefined,
      user: undefined,
      save: vi.fn().mockResolvedValue(true),
    }
    lastCreatedToken = instance
    return instance
  }
  return { default: MockToken }
})

// Mock AuthEmail — no queremos mandar emails reales en el test.
vi.mock('../../emails/AuthEmail', () => ({
  AuthEmail: {
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('AuthController.createAccount', () => {
  beforeEach(() => {
    vi.mocked(User.findOne).mockReset()
    vi.mocked(User.create).mockReset()
    vi.mocked(AuthEmail.sendConfirmationEmail).mockClear()
    lastCreatedToken = null
  })

  const validBody = {
    name: 'Juan',
    lastName: 'Perez',
    email: 'juan@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    birthdate: '1990-01-15',
  }

  function mockCreatedUser(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      email: validBody.email,
      name: validBody.name,
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    }
  }

  it('LB-84: strips role/isActive/profileComplete/memberships from the body — only whitelisted fields reach User.create (mass assignment fix)', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)
    vi.mocked(User.create).mockResolvedValue(mockCreatedUser() as any)

    const maliciousBody = {
      ...validBody,
      role: 'ADMIN',
      isActive: true,
      profileComplete: true,
      memberships: [{ group: new Types.ObjectId(), role: 'LEADER' }],
    }

    const req = buildMockRequest({ body: maliciousBody })
    const res = buildMockResponse()

    await AuthController.createAccount(req, res)

    expect(User.create).toHaveBeenCalledWith({
      name: validBody.name,
      lastName: validBody.lastName,
      email: validBody.email,
      password: validBody.password,
      birthdate: validBody.birthdate,
    })
    // Ninguno de los campos peligrosos debe filtrarse al payload de Mongoose.
    const createArg = vi.mocked(User.create).mock.calls[0][0] as Record<string, unknown>
    expect(createArg).not.toHaveProperty('role')
    expect(createArg).not.toHaveProperty('isActive')
    expect(createArg).not.toHaveProperty('profileComplete')
    expect(createArg).not.toHaveProperty('memberships')
  })

  it('creates the account with only the legitimate registration fields on a clean body', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)
    vi.mocked(User.create).mockResolvedValue(mockCreatedUser() as any)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.createAccount(req, res)

    expect(User.create).toHaveBeenCalledWith({
      name: validBody.name,
      lastName: validBody.lastName,
      email: validBody.email,
      password: validBody.password,
      birthdate: validBody.birthdate,
    })
    expect(res.send).toHaveBeenCalled()
  })

  it('returns 400 when the email is already registered', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: new Types.ObjectId() } as any)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.createAccount(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'El usuario ya existe' })
    expect(User.create).not.toHaveBeenCalled()
  })

  it('returns 400 when password and confirmPassword do not match', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { ...validBody, confirmPassword: 'somethingElse123' },
    })
    const res = buildMockResponse()

    await AuthController.createAccount(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Las contraseñas no coinciden' })
    expect(User.create).not.toHaveBeenCalled()
  })

  it('creates a confirmation token linked to the new user and sends the confirmation email', async () => {
    const createdUser = mockCreatedUser()
    vi.mocked(User.findOne).mockResolvedValue(null)
    vi.mocked(User.create).mockResolvedValue(createdUser as any)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.createAccount(req, res)

    expect(lastCreatedToken.user).toBe(createdUser._id)
    expect(lastCreatedToken.token).toEqual(expect.any(String))
    expect(AuthEmail.sendConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: createdUser.email, name: createdUser.name })
    )
  })
})
