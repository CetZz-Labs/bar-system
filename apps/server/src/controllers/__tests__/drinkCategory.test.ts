import { vi, describe, it, expect, beforeEach } from 'vitest'
import { DrinkCategoryController } from '../../controllers/DrinkCategoryController'
import DrinkCategory, { DrinkCategoryStatus } from '../../models/DrinkCategory'
import BarUser, { BarUserRole } from '../../models/BarUser'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

// Mock DrinkCategory model
vi.mock('../../models/DrinkCategory', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
  DrinkCategoryStatus: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    DELETED: 'deleted',
  },
}))

// Mock BarUser model
vi.mock('../../models/BarUser', () => ({
  default: {
    findOne: vi.fn(),
  },
  BarUserRole: {
    OWNER: 'OWNER',
    CASHIER: 'CASHIER',
  },
}))

function buildMockCategory(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    bar: new Types.ObjectId(),
    name: 'Beer',
    price: 500,
    status: DrinkCategoryStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('DrinkCategoryController.createCategory', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(DrinkCategory.findOne).mockReset()
    vi.mocked(DrinkCategory.countDocuments).mockReset()
    vi.mocked(DrinkCategory.create).mockReset()
  })

  it('creates a category when OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(null)
    vi.mocked(DrinkCategory.countDocuments).mockResolvedValue(0)
    vi.mocked(DrinkCategory.create).mockResolvedValue(buildMockCategory({ bar: barId }) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Beer', price: 500 },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(DrinkCategory.create).toHaveBeenCalled()
  })

  it('returns 403 when not OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Beer' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 409 on duplicate name', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(buildMockCategory() as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Beer' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('returns 400 when max active categories reached', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(null)
    vi.mocked(DrinkCategory.countDocuments).mockResolvedValue(20)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'New Category' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for empty name', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: '   ' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for negative price', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Beer', price: -10 },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.createCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })
})

describe('DrinkCategoryController.listCategories', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(DrinkCategory.find).mockReset()
  })

  it('returns active categories for CASHIER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockCategories = [
      buildMockCategory({ name: 'Beer', status: DrinkCategoryStatus.ACTIVE }),
      buildMockCategory({ name: 'Wine', status: DrinkCategoryStatus.ACTIVE }),
    ]

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)
    vi.mocked(DrinkCategory.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockCategories),
        }),
      }),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.listCategories(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({ name: 'Beer' }),
          expect.objectContaining({ name: 'Wine' }),
        ]),
      })
    )
  })

  it('returns all non-deleted categories for OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockCategories = [
      buildMockCategory({ name: 'Beer', status: DrinkCategoryStatus.ACTIVE }),
      buildMockCategory({ name: 'Wine', status: DrinkCategoryStatus.INACTIVE }),
    ]

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockCategories),
        }),
      }),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.listCategories(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({ name: 'Beer' }),
          expect.objectContaining({ name: 'Wine' }),
        ]),
      })
    )
  })

  it('returns 403 when user has no access to bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.listCategories(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('includes warning when less than 3 active categories for OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockCategories = [
      buildMockCategory({ name: 'Beer', status: DrinkCategoryStatus.ACTIVE }),
    ]

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockCategories),
        }),
      }),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.listCategories(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        warning: expect.stringContaining('1 categorías activas'),
      })
    )
  })
})

describe('DrinkCategoryController.updateCategory', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(DrinkCategory.findOne).mockReset()
  })

  it('updates name and price when OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne)
      .mockResolvedValueOnce(mockCategory as any) // find category by id
      .mockResolvedValueOnce(null) // no duplicate name

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { name: 'Craft Beer', price: 800 },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.updateCategory(req, res)

    expect(mockCategory.name).toBe('Craft Beer')
    expect(mockCategory.price).toBe(800)
    expect(mockCategory.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 403 when not OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { name: 'Craft Beer' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.updateCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when category not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { name: 'Craft Beer' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.updateCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 409 on duplicate name', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne)
      .mockResolvedValueOnce(mockCategory as any) // First call: find the category to update
      .mockResolvedValueOnce(buildMockCategory({ name: 'Craft Beer' }) as any) // Second call: check duplicate

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { name: 'Craft Beer' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.updateCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
  })
})

describe('DrinkCategoryController.toggleStatus', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(DrinkCategory.findOne).mockReset()
    vi.mocked(DrinkCategory.countDocuments).mockReset()
  })

  it('toggles from active to inactive', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId, status: DrinkCategoryStatus.ACTIVE })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(mockCategory as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { status: 'inactive' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.toggleStatus(req, res)

    expect(mockCategory.status).toBe(DrinkCategoryStatus.INACTIVE)
    expect(mockCategory.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('toggles from inactive to active with limit check', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId, status: DrinkCategoryStatus.INACTIVE })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(mockCategory as any)
    vi.mocked(DrinkCategory.countDocuments).mockResolvedValue(19)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { status: 'active' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.toggleStatus(req, res)

    expect(mockCategory.status).toBe(DrinkCategoryStatus.ACTIVE)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 400 when activating would exceed max limit', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId, status: DrinkCategoryStatus.INACTIVE })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(mockCategory as any)
    vi.mocked(DrinkCategory.countDocuments).mockResolvedValue(20)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { status: 'active' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.toggleStatus(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockCategory.save).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid status value', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { status: 'deleted' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.toggleStatus(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 403 when not OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
      body: { status: 'inactive' },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.toggleStatus(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('DrinkCategoryController.deleteCategory', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(DrinkCategory.findOne).mockReset()
  })

  it('soft-deletes a category when OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()
    const mockCategory = buildMockCategory({ _id: categoryId, bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(mockCategory as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.deleteCategory(req, res)

    expect(mockCategory.status).toBe(DrinkCategoryStatus.DELETED)
    expect(mockCategory.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 403 when not OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.deleteCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when category not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.deleteCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 404 when category is already deleted', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const categoryId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    // findOne with status != DELETED returns null because it's already deleted
    vi.mocked(DrinkCategory.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), categoryId: categoryId.toString() },
    })
    const res = buildMockResponse()

    await DrinkCategoryController.deleteCategory(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})
