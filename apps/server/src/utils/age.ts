const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export function calculateAge(birthdate: Date): number {
    const now = new Date()
    const birth = new Date(birthdate)
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        age--
    }
    return age
}

export function isOfLegalAge(birthdate: Date, minAge = 18): boolean {
    return calculateAge(birthdate) >= minAge
}
