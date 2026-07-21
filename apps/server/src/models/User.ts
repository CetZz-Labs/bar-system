import { Document, model, Schema, Types } from "mongoose";
import { hashPassword } from "../utils/auth";

export enum Role {
    ADMIN = 'ADMIN',
    USER = 'USER',
    OWNER = 'OWNER',
    WAITER = 'WAITER'
}

export enum MembershipRole {
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
    LEADER = 'LEADER',
    CO_LEADER = 'CO_LEADER'
}

export interface IMembership {
    group: Types.ObjectId;
    role: MembershipRole;
    joinedAt: Date;
}

export interface IUser extends Document {
    name: string;
    lastName: string;
    email: string;
    password: string;
    birthdate?: Date;
    role: Role;
    avatarUrl?: string; // or string if required
    isActive: boolean;
    profileComplete: boolean;
    memberships: IMembership[];
}

const userSchema = new Schema<IUser>({
    name: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    birthdate: {
        type: Date,
    },
    role: {
        type: String,
        enum: Object.values(Role),
        default: Role.USER
    },
    avatarUrl: {
        type: String,
    },
    isActive: {
        type: Boolean,
        default: false
    },
    profileComplete: {
        type: Boolean,
        default: false
    },
    memberships: {
        type: [{
            group: {
                type: Schema.Types.ObjectId,
                ref: 'Group'
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
    }
}, {
    timestamps: true
})

userSchema.pre('save', async function () {
    if (this.isModified('password')) {
        this.password = await hashPassword(this.password)
    }
})

const User = model<IUser>('User', userSchema)

export default User
