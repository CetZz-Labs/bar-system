/**
 * Migration: Add profileComplete field to existing users
 *
 * This script sets profileComplete based on existing user data:
 * - true if user has name, lastName, and birthdate
 * - false otherwise (new users default to false)
 *
 * Run with: npx ts-node src/migrations/add-profile-complete.ts
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

        // Count users that need migration
        const totalUsers = await usersCollection.countDocuments()
        console.log(`Total users: ${totalUsers}`)

        // Set profileComplete = true for users with complete profiles (name + lastName + birthdate)
        const resultComplete = await usersCollection.updateMany(
            {
                name: { $exists: true, $ne: '' },
                lastName: { $exists: true, $ne: '' },
                birthdate: { $exists: true, $ne: null },
                profileComplete: { $ne: true }
            },
            {
                $set: { profileComplete: true }
            }
        )
        console.log(`Users marked as profileComplete=true: ${resultComplete.modifiedCount}`)

        // Set profileComplete = false for users without birthdate (already default, but explicit)
        const resultIncomplete = await usersCollection.updateMany(
            {
                $or: [
                    { birthdate: { $exists: false } },
                    { birthdate: null }
                ],
                profileComplete: { $ne: false }
            },
            {
                $set: { profileComplete: false }
            }
        )
        console.log(`Users marked as profileComplete=false: ${resultIncomplete.modifiedCount}`)

        // Add profileComplete field to any users that don't have it yet
        const resultDefault = await usersCollection.updateMany(
            { profileComplete: { $exists: false } },
            { $set: { profileComplete: false } }
        )
        console.log(`Users with profileComplete field added (default false): ${resultDefault.modifiedCount}`)

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
