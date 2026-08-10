process.loadEnvFile();
import mongoose from 'mongoose';

async function main() {
    await mongoose.connect(process.env.DATABASE_URL as string);
    const id = new mongoose.Types.ObjectId('6a3b1aa29fe4ddd4346bb4e4');
    const r = await mongoose.connection.db!.collection('bars').updateOne(
        { _id: id },
        { $set: { status: 'active', closingHour: '06:00' } }
    );
    const bar = await mongoose.connection.db!.collection('bars').findOne(
        { _id: id },
        { projection: { name: 1, status: 1, closingHour: 1 } }
    );
    console.log(JSON.stringify({ matched: r.matchedCount, modified: r.modifiedCount, bar }, null, 2));
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
