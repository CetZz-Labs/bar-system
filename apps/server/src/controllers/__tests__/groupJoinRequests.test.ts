import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GroupController } from '../../controllers/GroupController'
import Group from '../../models/Group'
import User, { MembershipRole } from '../../models/User'
import JoinRequest, { JoinRequestStatus } from '../../models/JoinRequest'
import GroupBan from '../../models/GroupBan'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

vi.mock('../../models/Group', () => ({
  default: {
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(true),
  },
  GroupType: {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

vi.mock('../../models/JoinRequest', () => {
  const mockSave = vi.fn().mockResolvedValue(true)
  function MockJoinRequest(this: any, data: any) {
    Object.assign(this, data)
    this.save = mockSave
  }
  return {
    default: Object.assign(MockJoinRequest, {
      exists: vi.fn().mockResolvedValue(false),
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      }),
      countDocuments: vi.fn().mockResolvedValue(0),
      __mockSave: mockSave,
    }),
    JoinRequestStatus: {
      PENDING: 'PENDING',
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
    },
  }
})

vi.mock('../../models/GroupBan', () => ({
  default: {
    exists: vi.fn().mockResolvedValue(false),
  },
}))

function buildMockQuery(mockGroup: any) {
  return {
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(mockGroup),
  }
}

describe('GroupController.joinGroup - new behavior', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(User.findById).mockReset()
    vi.mocked(JoinRequest.exists).mockReset().mockResolvedValue(false)
    vi.mocked(GroupBan.exists).mockReset().mockResolvedValue(false)
  })

  describe('closed group', () => {
    it('creates a pending join request instead of joining', async () => {
      const userId = new Types.ObjectId()
      const groupId = new Types.ObjectId()

      const mockGroup = {
        _id: groupId,
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'CLOSED',
        inviteCode: 'BAN4K2',
        memberships: [],
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Solicitud enviada, esperando aprobación',
          status: 'pending',
        })
      )
    })
  })

  describe('banned user', () => {
    it('returns 403 when user is banned from the group', async () => {
      const userId = new Types.ObjectId()
      const groupId = new Types.ObjectId()

      const mockGroup = {
        _id: groupId,
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [],
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)
      vi.mocked(GroupBan.exists).mockResolvedValue(true)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'No podés unirte a este grupo' })
    })
  })

  describe('existing pending request', () => {
    it('returns 409 when user already has a pending request', async () => {
      const userId = new Types.ObjectId()
      const groupId = new Types.ObjectId()

      const mockGroup = {
        _id: groupId,
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'CLOSED',
        inviteCode: 'BAN4K2',
        memberships: [],
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)
      vi.mocked(JoinRequest.exists).mockResolvedValue(true)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ message: 'Solicitud enviada, esperando aprobación' })
    })
  })
})

describe('GroupController.getGroupByInviteCode - authenticated user', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(JoinRequest.exists).mockReset().mockResolvedValue(false)
    vi.mocked(GroupBan.exists).mockReset().mockResolvedValue(false)
  })

  it('returns userStatus=member when already a member', async () => {
    const userId = new Types.ObjectId()
    const mockGroup = {
      _id: new Types.ObjectId(),
      name: 'Los De Siempre',
      slug: 'los-de-siempre',
      type: 'OPEN',
      description: 'Banda de rock',
      avatarUrl: '/uploads/group-avatars/photo.jpg',
      inviteCode: 'BAN4K2',
      memberships: [
        { user: userId, role: MembershipRole.MEMBER, joinedAt: new Date() },
      ],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { inviteCode: 'BAN4K2' },
    })
    const res = buildMockResponse()

    await GroupController.getGroupByInviteCode(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        userStatus: 'member',
        message: 'Ya sos parte de este grupo',
      })
    )
  })

  it('returns userStatus=banned when user is banned', async () => {
    const userId = new Types.ObjectId()
    const mockGroup = {
      _id: new Types.ObjectId(),
      name: 'Los De Siempre',
      slug: 'los-de-siempre',
      type: 'OPEN',
      inviteCode: 'BAN4K2',
      memberships: [],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)
    vi.mocked(GroupBan.exists).mockResolvedValue(true)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { inviteCode: 'BAN4K2' },
    })
    const res = buildMockResponse()

    await GroupController.getGroupByInviteCode(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        userStatus: 'banned',
        message: 'No podés unirte a este grupo',
      })
    )
  })

  it('returns userStatus=pending when request is pending', async () => {
    const userId = new Types.ObjectId()
    const mockGroup = {
      _id: new Types.ObjectId(),
      name: 'Los De Siempre',
      slug: 'los-de-siempre',
      type: 'CLOSED',
      inviteCode: 'BAN4K2',
      memberships: [],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)
    vi.mocked(JoinRequest.exists).mockResolvedValue(true)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { inviteCode: 'BAN4K2' },
    })
    const res = buildMockResponse()

    await GroupController.getGroupByInviteCode(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        userStatus: 'pending',
        message: 'Solicitud enviada, esperando aprobación',
      })
    )
  })

  it('returns userStatus=available when user can join', async () => {
    const userId = new Types.ObjectId()
    const mockGroup = {
      _id: new Types.ObjectId(),
      name: 'Los De Siempre',
      slug: 'los-de-siempre',
      type: 'OPEN',
      inviteCode: 'BAN4K2',
      memberships: [],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { inviteCode: 'BAN4K2' },
    })
    const res = buildMockResponse()

    await GroupController.getGroupByInviteCode(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        userStatus: 'available',
      })
    )
  })
})

describe('GroupController.getPendingRequests', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(JoinRequest.find).mockReset().mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any)
  })

  it('returns pending requests for the leader', async () => {
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const requesterId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [{ user: leaderId, role: MembershipRole.LEADER }],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const mockRequests = [
      {
        _id: new Types.ObjectId(),
        user: { _id: requesterId, name: 'Juan', lastName: 'Pérez', avatarUrl: '/uploads/avatars/juan.jpg' },
        createdAt: new Date('2024-01-01'),
      },
    ]
    vi.mocked(JoinRequest.find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRequests),
    } as any)

    const req = buildMockRequest({
      user: { _id: leaderId } as any,
      params: { slug: 'los-de-siempre' },
    })
    const res = buildMockResponse()

    await GroupController.getPendingRequests(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const response = (res.json as any).mock.calls[0][0]
    expect(response).toHaveLength(1)
    expect(response[0].user.name).toBe('Juan Pérez')
  })

  it('returns 403 for non-leaders', async () => {
    const memberId = new Types.ObjectId()
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [{ user: memberId, role: MembershipRole.MEMBER }],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const req = buildMockRequest({
      user: { _id: memberId } as any,
      params: { slug: 'los-de-siempre' },
    })
    const res = buildMockResponse()

    await GroupController.getPendingRequests(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('GroupController.approveRequest', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(User.findById).mockReset()
    vi.mocked(GroupBan.exists).mockReset().mockResolvedValue(false)
    vi.mocked(Group.findByIdAndUpdate).mockReset().mockResolvedValue(true)
  })

  it('approves a pending request and adds user to group', async () => {
    const leaderId = new Types.ObjectId()
    const requesterId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const requestId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const mockRequest = {
      _id: requestId,
      group: groupId,
      user: requesterId,
      status: JoinRequestStatus.PENDING,
      save: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(JoinRequest.findOne).mockResolvedValue(mockRequest as any)

    const mockUser = {
      _id: requesterId,
      memberships: [],
      save: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(User.findById).mockResolvedValue(mockUser as any)

    const req = buildMockRequest({
      user: { _id: leaderId } as any,
      params: { slug: 'los-de-siempre', requestId: requestId.toString() },
    })
    const res = buildMockResponse()

    await GroupController.approveRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ message: 'Solicitud aprobada' })
    expect(mockRequest.status).toBe(JoinRequestStatus.APPROVED)
    expect(mockRequest.save).toHaveBeenCalled()
    expect(mockUser.save).toHaveBeenCalled()
  })

  it('returns 403 for non-leaders', async () => {
    const memberId = new Types.ObjectId()
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const req = buildMockRequest({
      user: { _id: memberId } as any,
      params: { slug: 'los-de-siempre', requestId: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await GroupController.approveRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when request not found', async () => {
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [],
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)
    vi.mocked(JoinRequest.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: leaderId } as any,
      params: { slug: 'los-de-siempre', requestId: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await GroupController.approveRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('GroupController.rejectRequest', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(JoinRequest.findOne).mockReset().mockResolvedValue(null)
  })

  it('rejects a pending request', async () => {
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const requestId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const mockRequest = {
      _id: requestId,
      group: groupId,
      status: JoinRequestStatus.PENDING,
      save: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(JoinRequest.findOne).mockResolvedValue(mockRequest as any)

    const req = buildMockRequest({
      user: { _id: leaderId } as any,
      params: { slug: 'los-de-siempre', requestId: requestId.toString() },
    })
    const res = buildMockResponse()

    await GroupController.rejectRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ message: 'Solicitud rechazada' })
    expect(mockRequest.status).toBe(JoinRequestStatus.REJECTED)
    expect(mockRequest.save).toHaveBeenCalled()
  })

  it('returns 403 for non-leaders', async () => {
    const memberId = new Types.ObjectId()
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const mockGroup = {
      _id: groupId,
      leader: leaderId,
    }
    vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

    const req = buildMockRequest({
      user: { _id: memberId } as any,
      params: { slug: 'los-de-siempre', requestId: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await GroupController.rejectRequest(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})
