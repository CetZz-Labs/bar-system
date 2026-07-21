export function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
}

export interface ScheduleSlot {
    day: number
    open: string
    close: string
}

/**
 * Determines if a bar is currently open based on its schedule.
 * Supports overnight hours (e.g. 20:00 - 03:00).
 *
 * @param schedule Array of schedule slots
 * @param date Optional date to check (defaults to now)
 */
export function isBarOpen(schedule: ScheduleSlot[], date = new Date()): boolean {
    const currentDay = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const currentMinutes = date.getHours() * 60 + date.getMinutes()

    // Check today's regular slots
    const todaySlots = schedule.filter((s) => s.day === currentDay)
    for (const slot of todaySlots) {
        const openMin = timeToMinutes(slot.open)
        const closeMin = timeToMinutes(slot.close)

        if (closeMin > openMin) {
            // Same-day close (e.g. 10:00 - 18:00)
            if (currentMinutes >= openMin && currentMinutes <= closeMin) {
                return true
            }
        } else {
            // Overnight close (e.g. 20:00 - 03:00)
            if (currentMinutes >= openMin) {
                return true
            }
        }
    }

    // Check yesterday's overnight slots that spill into today
    const yesterday = currentDay === 0 ? 6 : currentDay - 1
    const yesterdaySlots = schedule.filter((s) => s.day === yesterday)
    for (const slot of yesterdaySlots) {
        const openMin = timeToMinutes(slot.open)
        const closeMin = timeToMinutes(slot.close)

        if (closeMin < openMin && currentMinutes <= closeMin) {
            return true
        }
    }

    return false
}
