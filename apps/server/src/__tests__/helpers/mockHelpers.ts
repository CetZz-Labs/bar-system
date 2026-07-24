import { Types } from 'mongoose'
import { Role, IUser } from '../../models/User'
import { Request, Response, NextFunction } from 'express'
import { vi } from 'vitest'

export const buildMockUser = (overrides: Partial<IUser> = {}): IUser => ({
  _id: new Types.ObjectId(),
  name: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: '$2b$04$hashedpassword',      // Pre-hashed bcrypt string
  role: Role.USER,
  isActive: true,
  profileComplete: false,
  birthdate: new Date('1990-01-01'),
  phone: undefined,
  avatarUrl: undefined,
  memberships: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  // Mongoose Document methods (stubs)
  save: vi.fn().mockResolvedValue(true),
  deleteOne: vi.fn().mockResolvedValue(true),
  isModified: vi.fn().mockReturnValue(false),
  toObject: vi.fn().mockReturnValue({}),
  ...overrides,
} as unknown as IUser)

export const buildMockRequest = (overrides: Partial<Request> = {}): Request => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  cookies: {},
  user: undefined,
  ...overrides,
} as Request)

export const buildMockResponse = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),      // chaining: res.status(401).json(...)
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

export const buildMockNext = (): NextFunction => vi.fn() as unknown as NextFunction