/**
 * Migration: Cashier login (LB-53)
 *
 * - Collection `barusers`:
 *   - Roles WAITER/MANAGER (deprecados) pasan a CASHIER.
 *   - Se agrega `isActive: true` a los documentos que no lo tengan.
 * - Collection `bars`:
 *   - Se agrega `closingTime: '06:00'` a los documentos que no lo tengan.
 *
 * Run with: npx ts-node src/migrations/migrate-cashier-roles.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.DATABASE_URL || process.env.MONGODB_URI || ''

async function migrate() {
    if (!MONGODB_URI) {
        console.error('Error: DATABASE_URL or MONGODB_URI environment variable is required')
        process.exit(1)
    }

    try {
        await mongoose.connect(MONGODB_URI)
        console.log('Connected to MongoDB')

        const db = mongoose.connection.db
        if (!db) {
            throw new Error('Failed to get database connection')
        }

        const barUsersCollection = db.collection('barusers')
        const barsCollection = db.collection('bars')

        const totalBarUsers = await barUsersCollection.countDocuments()
        console.log(`Total barUsers: ${totalBarUsers}`)

        // WAITER/MANAGER (deprecados) -> CASHIER
        const resultRole = await barUsersCollection.updateMany(
            { role: { $in: ['WAITER', 'MANAGER'] } },
            { $set: { role: 'CASHIER' } }
        )
        console.log(`BarUsers migrated from WAITER/MANAGER to CASHIER: ${resultRole.modifiedCount}`)

        // Add isActive = true to barUsers that don't have it yet
        const resultIsActive = await barUsersCollection.updateMany(
            { isActive: { $exists: false } },
            { $set: { isActive: true } }
        )
        console.log(`BarUsers with isActive field added (default true): ${resultIsActive.modifiedCount}`)

        const totalBars = await barsCollection.countDocuments()
        console.log(`Total bars: ${totalBars}`)

        // Add closingTime = '06:00' to bars that don't have it yet
        const resultClosingTime = await barsCollection.updateMany(
            { closingTime: { $exists: false } },
            { $set: { closingTime: '06:00' } }
        )
        console.log(`Bars with closingTime field added (default '06:00'): ${resultClosingTime.modifiedCount}`)

        console.log('Migration completed successfully')
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    } finally {
        await mongoose.disconnect()
        console.log('Disconnected from MongoDB')
    }
}

migrate()
