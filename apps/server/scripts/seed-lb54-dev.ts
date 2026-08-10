/**
 * Seed local para probar LB-54 (no usar en prod).
 * Uso: pnpm exec tsx scripts/seed-lb54-dev.ts
 */
import path from 'path';
import mongoose from 'mongoose';
import { hashPassword } from '../src/utils/auth';
import User, { MembershipRole, Role } from '../src/models/User';
import Bar, { BarStatus } from '../src/models/Bar';
import BarUser, { BarUserRole } from '../src/models/BarUser';
import Group, { GroupType } from '../src/models/Group';
import Outing, { OutingStatus } from '../src/models/Outing';

process.chdir(path.join(__dirname, '..'));
if (process.env.NODE_ENV !== 'production') {
    process.loadEnvFile();
}

const EMAIL = 'cajero@labanda.local';
const PASSWORD = 'Cajero123!';

async function main() {
    await mongoose.connect(process.env.DATABASE_URL as string);

    let user = await User.findOne({ email: EMAIL });
    if (!user) {
        user = await User.create({
            name: 'Franco',
            lastName: 'Espinoza',
            email: EMAIL,
            password: await hashPassword(PASSWORD),
            role: Role.USER,
            isActive: true,
            profileComplete: true,
            birthdate: new Date('1998-01-15'),
        });
        console.log('User created:', EMAIL);
    } else {
        console.log('User already exists:', EMAIL);
    }

    let bar = await Bar.findOne({ slug: 'bar-demo-lb54' });
    if (!bar) {
        bar = await Bar.create({
            name: 'Bar Demo LB54',
            slug: 'bar-demo-lb54',
            address: {
                street: 'Av. Corrientes',
                number: '1234',
                neighborhood: 'Centro',
                city: 'CABA',
            },
            phone: '+541100000000',
            schedule: [{ day: 5, open: '20:00', close: '04:00' }],
            closingHour: '06:00',
            status: BarStatus.ACTIVE,
            description: 'Bar de prueba local',
        });
        console.log('Bar created:', bar._id.toString());
    } else {
        if (bar.status !== BarStatus.ACTIVE) {
            bar.status = BarStatus.ACTIVE;
            await bar.save();
        }
        console.log('Bar already exists:', bar._id.toString());
    }

    const membership = await BarUser.findOne({ bar: bar._id, user: user._id });
    if (!membership) {
        await BarUser.create({
            bar: bar._id,
            user: user._id,
            role: BarUserRole.OWNER,
        });
        console.log('BarUser OWNER linked');
    }

    let group = await Group.findOne({ slug: 'los-demo' });
    if (!group) {
        group = await Group.create({
            name: 'Los Demo',
            slug: 'los-demo',
            type: GroupType.OPEN,
            inviteCode: 'DEMO01',
            leader: user._id,
            memberships: [
                {
                    user: user._id,
                    role: MembershipRole.LEADER,
                    joinedAt: new Date(),
                },
            ],
        });
        console.log('Group created, inviteCode=DEMO01');
    } else {
        console.log('Group exists, inviteCode=', group.inviteCode);
    }

    const existingOuting = await Outing.findOne({
        group: group._id,
        bar: bar._id,
        status: { $in: [OutingStatus.ACTIVE, OutingStatus.IN_PROGRESS] },
    });
    if (!existingOuting) {
        const scheduledFor = new Date();
        scheduledFor.setHours(scheduledFor.getHours() + 2);
        await Outing.create({
            group: group._id,
            bar: bar._id,
            leader: user._id,
            status: OutingStatus.ACTIVE,
            scheduledFor,
            invitedMembers: [{ user: user._id }],
        });
        console.log('Outing ACTIVE created for tonight');
    } else {
        console.log('Active outing already exists');
    }

    console.log('\n=== CREDENCIALES CAJERO ===');
    console.log('URL:      http://localhost:5173/cashier/login');
    console.log('Email:    ', EMAIL);
    console.log('Password: ', PASSWORD);
    console.log('Bar ID:   ', bar._id.toString());
    console.log('Prueba búsqueda: "Los" o código DEMO01');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
