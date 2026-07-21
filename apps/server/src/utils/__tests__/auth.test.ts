import { vi, describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { hashPassword, checkPassword } from '../auth'

vi.mock('bcrypt', () => ({
  default: {
    genSalt: vi.fn(),
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

describe('hashPassword', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.genSalt).mockReset()
    vi.mocked(bcrypt.hash).mockReset()
  })

  it('returns a hashed password', async () => {
    const mockSalt = '$2b$04$mocksalt'
    const mockHash = '$2b$04$mockhashedpassword'
    vi.mocked(bcrypt.genSalt).mockResolvedValue(mockSalt as never)
    vi.mocked(bcrypt.hash).mockResolvedValue(mockHash as never)

    const result = await hashPassword('password123')
    expect(result).toBe(mockHash)
  })

  it('calls bcrypt.genSalt with SALT_ROUNDS env var', async () => {
    const originalSALT_ROUNDS = process.env.SALT_ROUNDS
    process.env.SALT_ROUNDS = '4'
    vi.mocked(bcrypt.genSalt).mockResolvedValue('$2b$04$salt' as never)
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$04$hash' as never)

    await hashPassword('password123')
    expect(bcrypt.genSalt).toHaveBeenCalledWith(4)

    process.env.SALT_ROUNDS = originalSALT_ROUNDS
  })

  it('calls bcrypt.hash with password and salt', async () => {
    const mockSalt = '$2b$04$salt'
    const mockHash = '$2b$04$hash'
    vi.mocked(bcrypt.genSalt).mockResolvedValue(mockSalt as never)
    vi.mocked(bcrypt.hash).mockResolvedValue(mockHash as never)

    await hashPassword('mypassword')
    expect(bcrypt.hash).toHaveBeenCalledWith('mypassword', mockSalt)
  })

  it('uses default salt rounds of 10 when SALT_ROUNDS not set', async () => {
    const originalSALT_ROUNDS = process.env.SALT_ROUNDS
    delete process.env.SALT_ROUNDS
    vi.mocked(bcrypt.genSalt).mockResolvedValue('$2b$10$salt' as never)
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$hash' as never)

    await hashPassword('password')
    expect(bcrypt.genSalt).toHaveBeenCalledWith(10)

    process.env.SALT_ROUNDS = originalSALT_ROUNDS
  })
})

describe('checkPassword', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.compare).mockReset()
  })

  it('returns true when password matches hash', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    const result = await checkPassword('password', '$2b$04$hash')
    expect(result).toBe(true)
  })

  it('returns false when password does not match', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    const result = await checkPassword('wrongpassword', '$2b$04$hash')
    expect(result).toBe(false)
  })

  it('calls bcrypt.compare with correct arguments', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    await checkPassword('entered', 'stored')
    expect(bcrypt.compare).toHaveBeenCalledWith('entered', 'stored')
  })
})