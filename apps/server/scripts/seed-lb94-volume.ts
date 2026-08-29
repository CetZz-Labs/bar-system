/**
 * LB-94 — seed de VOLUMEN para dar contexto real a `load-test-dashboard.ts`.
 *
 * IMPORTANTE: el usuario pidió explícitamente dejar este script armado y
 * documentado, pero SIN correrlo hoy. No lo ejecutes contra ningún ambiente
 * (ni siquiera local) salvo indicación explícita de un humano — inserta
 * varias semanas de `Outing`/`Consumption`/`PointsTransaction`/`Redemption`
 * reales en la base a la que apunte `DATABASE_URL`.
 *
 * Por qué hace falta: el fix de LB-94 en `utils/barDashboard.ts` (query
 * sargable sobre `checkedInAt`/`scheduledFor`) solo se nota bajo carga si el
 * bar de prueba tiene histórico real — con pocas `Outing` cualquier query
 * corre rápido con o sin el fix. Ver progress/explorers/exp_LB-94.md §5,
 * punto 5.
 *
 * Requisito previo: un `Bar` ya existente (activo) — reutilizá el creado por
 * `seed-lb54-dev.ts` o `set-cashier-role.ts`, o el `BAR_ID` que le vayas a
 * pasar a `load-test-dashboard.ts`.
 *
 * Variables de entorno:
 *   BAR_ID           (requerido) ObjectId del Bar de prueba.
 *   WEEKS            (opcional, default 8) semanas de histórico a generar.
 *   OUTINGS_PER_DAY  (opcional, default 20) salidas COMPLETED por día de
 *                    bar, simulando "un sábado con 20 grupos activos"
 *                    (criterio usado en todo el ticket LB-94).
 *
 * Uso (desde apps/server):
 *   BAR_ID=<id> WEEKS=8 OUTINGS_PER_DAY=20 npx tsx scripts/seed-lb94-volume.ts
 */
import path from 'path';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '../src/utils/auth';
import User from '../src/models/User';
import { MembershipRole } from '../src/models/User';
import Bar from '../src/models/Bar';
import BarUser, { BarUserRole } from '../src/models/BarUser';
import Group, { GroupType } from '../src/models/Group';
import Outing, { OutingStatus } from '../src/models/Outing';
import Consumption, { ConsumptionStatus } from '../src/models/Consumption';
import PointsTransaction, { PointsTransactionType } from '../src/models/PointsTransaction';
import Reward from '../src/models/Reward';
import Redemption, { RedemptionStatus } from '../src/models/Redemption';

process.chdir(path.join(__dirname, '..'));
if (process.env.NODE_ENV !== 'production') {
    process.loadEnvFile();
}

const BAR_ID = process.env.BAR_ID;
const WEEKS = Number(process.env.WEEKS ?? 8);
const OUTINGS_PER_DAY = Number(process.env.OUTINGS_PER_DAY ?? 20);
const SEED_PASSWORD = 'Lb94LoadTest!123';

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface SeedGroup {
    groupId: Types.ObjectId;
    leaderId: Types.ObjectId;
}

async function ensureCashier(barId: Types.ObjectId): Promise<Types.ObjectId> {
    const email = 'lb94.cashier@labanda.local';
    let user = await User.findOne({ email });
    if (!user) {
        user = await User.create({
            name: 'Cajero',
            lastName: 'CargaLB94',
            email,
            password: await hashPassword(SEED_PASSWORD),
            isActive: true,
            profileComplete: true,
            birthdate: new Date('1995-01-01'),
        });
    }

    await BarUser.findOneAndUpdate(
        { bar: barId, user: user._id },
        { $setOnInsert: { role: BarUserRole.CASHIER, isActive: true } },
        { upsert: true }
    );

    return user._id as Types.ObjectId;
}

async function ensureRewardId(barId: Types.ObjectId): Promise<{ id: Types.ObjectId; name: string; points: number }> {
    const name = 'LB-94 Load Reward';
    let reward = await Reward.findOne({ bar: barId, name });
    if (!reward) {
        reward = await Reward.create({
            bar: barId,
            name,
            pointsRequired: 50,
            unlimitedStock: true,
        });
    }
    return { id: reward._id as Types.ObjectId, name: reward.name, points: reward.pointsRequired };
}

async function ensureSeedGroups(count: number): Promise<SeedGroup[]> {
    const groups: SeedGroup[] = [];

    for (let i = 0; i < count; i++) {
        const email = `lb94.load.leader.${i}@labanda.local`;
        let leader = await User.findOne({ email });
        if (!leader) {
            leader = await User.create({
                name: 'Lider',
                lastName: `Carga${i}`,
                email,
                password: await hashPassword(SEED_PASSWORD),
                isActive: true,
                profileComplete: true,
                birthdate: new Date('1995-01-01'),
            });
        }

        const slug = `lb94-load-group-${i}`;
        let group = await Group.findOne({ slug });
        if (!group) {
            group = await Group.create({
                name: `Grupo carga LB-94 #${i}`,
                slug,
                type: GroupType.OPEN,
                leader: leader._id,
                memberships: [{ user: leader._id, role: MembershipRole.LEADER, joinedAt: new Date() }],
            });
        }

        groups.push({ groupId: group._id as Types.ObjectId, leaderId: leader._id as Types.ObjectId });
    }

    return groups;
}

async function main(): Promise<void> {
    if (!BAR_ID) {
        throw new Error('BAR_ID es requerido (ObjectId del bar de prueba)');
    }

    await mongoose.connect(process.env.DATABASE_URL as string);

    const bar = await Bar.findById(BAR_ID);
    if (!bar) {
        throw new Error(`Bar no encontrado: ${BAR_ID}`);
    }
    const barId = bar._id as Types.ObjectId;

    const cashierId = await ensureCashier(barId);
    const reward = await ensureRewardId(barId);
    const groups = await ensureSeedGroups(OUTINGS_PER_DAY);

    const now = new Date();
    const totalDays = WEEKS * 7;

    const outingDocs: Record<string, unknown>[] = [];
    const consumptionDocs: Record<string, unknown>[] = [];
    const pointsDocs: Record<string, unknown>[] = [];
    const redemptionDocs: Record<string, unknown>[] = [];

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const day = new Date(now);
        day.setDate(day.getDate() - dayOffset);

        for (const group of groups) {
            const scheduledFor = new Date(day);
            scheduledFor.setHours(21, 0, 0, 0);

            const checkedInAt = new Date(scheduledFor);
            checkedInAt.setMinutes(checkedInAt.getMinutes() + randomInt(5, 90));

            const outingId = new Types.ObjectId();
            outingDocs.push({
                _id: outingId,
                group: group.groupId,
                bar: barId,
                createdBy: group.leaderId,
                scheduledFor,
                status: OutingStatus.COMPLETED,
                checkedInAt,
                checkedInBy: cashierId,
                closedAt: checkedInAt,
            });

            const amount = randomInt(2, 20) * 1000;
            const consumptionId = new Types.ObjectId();
            consumptionDocs.push({
                _id: consumptionId,
                outing: outingId,
                bar: barId,
                cashier: cashierId,
                amount,
                status: ConsumptionStatus.CONFIRMED,
                qrToken: `lb94-load-${outingId.toString()}`,
                manualCode: String(randomInt(100000, 999999)),
                expiresAt: new Date(checkedInAt.getTime() + 60 * 60 * 1000),
            });

            pointsDocs.push({
                group: group.groupId,
                outing: outingId,
                bar: barId,
                type: PointsTransactionType.CONSUMPTION,
                amount: Math.max(1, Math.round(amount / 100)),
                label: `Consumo $${amount} (seed LB-94)`,
                consumption: consumptionId,
            });

            pointsDocs.push({
                group: group.groupId,
                outing: outingId,
                bar: barId,
                type: PointsTransactionType.ATTENDANCE,
                amount: 10,
                label: 'Asistencia (seed LB-94)',
            });

            // ~1 de cada 10 salidas termina en un canje validado, para que
            // las agregaciones de Redemption del dashboard también tengan
            // volumen real que recorrer.
            if (randomInt(1, 10) === 1) {
                redemptionDocs.push({
                    group: group.groupId,
                    outing: outingId,
                    bar: barId,
                    reward: reward.id,
                    leader: group.leaderId,
                    rewardNameSnapshot: reward.name,
                    pointsRequiredSnapshot: reward.points,
                    status: RedemptionStatus.VALIDATED,
                    qrToken: `lb94-load-redemption-${outingId.toString()}`,
                    manualCode: String(randomInt(100000, 999999)),
                    expiresAt: new Date(checkedInAt.getTime() + 60 * 60 * 1000),
                    cashier: cashierId,
                    validatedAt: checkedInAt,
                });
            }
        }
    }

    console.log(
        `Insertando ${outingDocs.length} Outing, ${consumptionDocs.length} Consumption, ` +
        `${pointsDocs.length} PointsTransaction, ${redemptionDocs.length} Redemption ` +
        `para el bar ${barId.toString()} (${WEEKS} semanas x ${OUTINGS_PER_DAY} salidas/día)...`
    );

    await Outing.insertMany(outingDocs, { ordered: false });
    await Consumption.insertMany(consumptionDocs, { ordered: false });
    await PointsTransaction.insertMany(pointsDocs, { ordered: false });
    if (redemptionDocs.length > 0) {
        await Redemption.insertMany(redemptionDocs, { ordered: false });
    }

    console.log('Listo.');

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
