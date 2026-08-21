import { Document, model, Schema, Types } from "mongoose";
import { MembershipRole } from "./User";
import { generateSlug } from "../utils/slug";
import { generateInviteCode } from "../utils/code";

export enum GroupType {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED'
}

export interface IGroupMembership {
    user: Types.ObjectId;
    role: MembershipRole;
    joinedAt: Date;
}

export interface IDepartedMember {
    user: Types.ObjectId;
    name: string;
    departedAt: Date;
}

export interface ISuccessionNotification {
    newLeader: Types.ObjectId;
    newLeaderName: string;
    previousLeaderName: string;
    createdAt: Date;
}

export interface IGroup extends Document {
    name: string;
    slug: string;
    type: GroupType;
    description?: string;
    inviteCode: string;
    leader: Types.ObjectId;
    avatarUrl?: string;
    memberships: IGroupMembership[];
    departedMembers: IDepartedMember[];
    seenDepartures: Types.ObjectId[];
    successionNotifications: ISuccessionNotification[];
    seenSuccessions: Types.ObjectId[];
    // Saldo de puntos acumulado (LB-59). Acreditado por
    // utils/attendancePoints.ts; historial detallado en la colección
    // PointsTransaction.
    pointsBalance: number;
}

const groupSchema = new Schema<IGroup>({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    type: {
        type: String,
        enum: Object.values(GroupType),
        required: true
    },
    description: {
        type: String,
        trim: true
    },
    inviteCode: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    leader: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    avatarUrl: {
        type: String,
    },
    memberships: {
        type: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            role: {
                type: String,
                enum: Object.values(MembershipRole),
                default: MembershipRole.MEMBER
            },
            joinedAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    departedMembers: {
        type: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            name: {
                type: String,
                required: true
            },
            departedAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    seenDepartures: {
        type: [Schema.Types.ObjectId],
        default: []
    },
    successionNotifications: {
        type: [{
            newLeader: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            newLeaderName: {
                type: String,
                required: true
            },
            previousLeaderName: {
                type: String,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    seenSuccessions: {
        type: [Schema.Types.ObjectId],
        default: []
    },
    pointsBalance: {
        type: Number,
        default: 0,
        min: 0,
    }
}, {
    timestamps: true
});

groupSchema.index({ leader: 1 })

groupSchema.pre('save', async function () {
    const group = this;
    const maxRetries = 10;

    if (group.isNew) {
        if (!group.slug) {
            let slug: string;
            let exists = true;
            let retries = 0;

            while (exists && retries < maxRetries) {
                slug = generateSlug(group.name);
                const existing = await group.model('Group').findOne({ slug }).select('_id').lean();
                exists = !!existing;
                retries++;
            }

            group.slug = slug!;
        }

        if (!group.inviteCode) {
            let inviteCode: string;
            let exists = true;
            let retries = 0;

            while (exists && retries < maxRetries) {
                inviteCode = generateInviteCode();
                const existing = await group.model('Group').findOne({ inviteCode }).select('_id').lean();
                exists = !!existing;
                retries++;
            }

            group.inviteCode = inviteCode!;
        }
    }
});

const Group = model<IGroup>('Group', groupSchema);

export default Group;
