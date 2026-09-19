import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { AuthController } from '../../controllers/AuthController'
import User from '../../models/User'
import Token from '../../models/Token'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-115: activación de cuenta de cajero — mismo mecanismo de Token que
// confirmAccount/updatePasswordWithToken, pero fija contraseña y activa la
// cuenta en un solo paso (ver progress/implementers/impl_LB-115.md).

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/Token', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('AuthController.activateCashierAccount', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
    vi.mocked(Token.findOne).mockReset()
  })

  const validBody = { token: '123456', password: 'newPassword123', confirmPassword: 'newPassword123' }

  it('sets the password and activates the user, then deletes the token', async () => {
    const userId = new Types.ObjectId()
    const mockUser = {
      _id: userId,
      email: 'cajero@example.com',
      password: 'randomly-generated-hash',
      isActive: false,
      save: vi.fn().mockResolvedValue(true),
    }
    const mockToken = { user: userId, deleteOne: vi.fn().mockResolvedValue(true) }

    vi.mocked(Token.findOne).mockResolvedValue(mockToken as any)
    vi.mocked(User.findById).mockResolvedValue(mockUser as any)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.activateCashierAccount(req, res)

    expect(mockUser.password).toBe(validBody.password)
    expect(mockUser.isActive).toBe(true)
    expect(mockUser.save).toHaveBeenCalled()
    expect(mockToken.deleteOne).toHaveBeenCalled()
    expect(res.send).toHaveBeenCalled()
  })

  it('returns 404 when the token does not exist', async () => {
    vi.mocked(Token.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.activateCashierAccount(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(User.findById).not.toHaveBeenCalled()
  })

  it('returns 404 when the user does not exist', async () => {
    const mockToken = { user: new Types.ObjectId(), deleteOne: vi.fn() }
    vi.mocked(Token.findOne).mockResolvedValue(mockToken as any)
    vi.mocked(User.findById).mockResolvedValue(null)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.activateCashierAccount(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 409 and deletes the token when the account is already active', async () => {
    const mockUser = { _id: new Types.ObjectId(), isActive: true, save: vi.fn() }
    const mockToken = { user: mockUser._id, deleteOne: vi.fn().mockResolvedValue(true) }

    vi.mocked(Token.findOne).mockResolvedValue(mockToken as any)
    vi.mocked(User.findById).mockResolvedValue(mockUser as any)

    const req = buildMockRequest({ body: validBody })
    const res = buildMockResponse()

    await AuthController.activateCashierAccount(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(mockToken.deleteOne).toHaveBeenCalled()
    expect(mockUser.save).not.toHaveBeenCalled()
  })
})
