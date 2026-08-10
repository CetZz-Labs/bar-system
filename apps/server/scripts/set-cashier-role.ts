process.loadEnvFile();
import mongoose from 'mongoose';

const EMAIL = 'beshako@gmail.com';
const BAR_ID = '6a3b1aa29fe4ddd4346bb4e4';
const ROLE = 'OWNER'; // panel cajero acepta OWNER | CASHIER

async function main() {
    await mongoose.connect(process.env.DATABASE_URL as string);
    const db = mongoose.connection.db!;

    const user = await db.collection('users').findOne(
        { email: EMAIL.toLowerCase() },
        { projection: { email: 1, name: 1, lastName: 1, isActive: 1, profileComplete: 1 } }
    );
    if (!user) {
        throw new Error(`Usuario no encontrado: ${EMAIL}`);
    }

    // Asegurar cuenta usable
    await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { isActive: true, profileComplete: true } }
    );

    const bar = await db.collection('bars').findOne(
        { _id: new mongoose.Types.ObjectId(BAR_ID) },
        { projection: { name: 1, status: 1 } }
    );
    if (!bar) {
        throw new Error(`Bar no encontrado: ${BAR_ID}`);
    }
    if (bar.status !== 'active') {
        await db.collection('bars').updateOne(
            { _id: bar._id },
            { $set: { status: 'active', closingHour: '06:00' } }
        );
    }

    const existing = await db.collection('barusers').findOne({
        bar: bar._id,
        user: user._id,
    });

    if (existing) {
        await db.collection('barusers').updateOne(
            { _id: existing._id },
            { $set: { role: ROLE, updatedAt: new Date() } }
        );
    } else {
        await db.collection('barusers').insertOne({
            bar: bar._id,
            user: user._id,
            role: ROLE,
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0,
        });
    }

    const link = await db.collection('barusers').findOne({
        bar: bar._id,
        user: user._id,
    });

    console.log(
        JSON.stringify(
            {
                ok: true,
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    lastName: user.lastName,
                },
                bar: { id: bar._id, name: bar.name },
                role: link?.role,
            },
            null,
            2
        )
    );

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
