/**
 * Migration: Add phone field to existing users
 *
 * Sets phone = null for all users that don't have the field yet,
 * so that { phone: { $exists: true } } queries work correctly.
 *
 * Run with: npx ts-node src/migrations/add-phone-to-users.ts
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

        const usersCollection = db.collection('users')

        const totalUsers = await usersCollection.countDocuments()
        console.log(`Total users: ${totalUsers}`)

        const result = await usersCollection.updateMany(
            { phone: { $exists: false } },
            { $set: { phone: null } }
        )
        console.log(`Users with phone field added (default null): ${result.modifiedCount}`)

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
