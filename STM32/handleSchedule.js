const moment = require('moment');

/**
 * Determines if a device should be running based on a list of schedules.
 *
 * @param {Array<Schedule>} schedules - An array of schedule objects.
 * @returns {boolean} True if the device should be running, otherwise false.
 */
function handleSchedule(schedules) {
    const now = moment.utc();
    const todayCode = now.format('dd').toUpperCase(); // MO, TU, etc.

    console.log(`--- Schedule Check ---`);
    console.log(`Current Time (UTC): ${now.format('YYYY-MM-DD HH:mm:ssZ')}`);
    console.log(`Current Day: ${todayCode}`);
    console.log(`----------------------\n`);

    // 🔴 Step 1: Check exceptions first
    for (const schedule of schedules) {
        if (!schedule.is_exception) continue;

        const { start_time, end_time, start_date, end_date, recurrence_rule, schedule_name } = schedule;

        const startDate = moment.utc(start_date);
        const endDate = moment.utc(end_date);

        if (!now.isBetween(startDate, endDate, 'day', '[]')) continue;

        let scheduleStart = moment.utc(start_time);
        let scheduleEnd = moment.utc(end_time);

        // Set schedule start/end to today
        scheduleStart.set({ year: now.year(), month: now.month(), date: now.date() });
        scheduleEnd.set({ year: now.year(), month: now.month(), date: now.date() });

        // Overnight handling
        if (scheduleEnd.isBefore(scheduleStart)) scheduleEnd.add(1, 'day');

        if (now.isBetween(scheduleStart, scheduleEnd, null, '[]')) {
            console.log(`🚫 Exception active: ${schedule_name}. Device must NOT run.`);
            return false;
        }
    }

    // 🟢 Step 2: Check normal schedules
    for (const schedule of schedules) {
        if (schedule.is_exception) continue;

        const { start_time, end_time, start_date, end_date, recurrence_rule, schedule_name } = schedule;

        const startDate = moment.utc(start_date);
        const endDate = moment.utc(end_date);

        if (!now.isBetween(startDate, endDate, 'day', '[]')) continue;

        let scheduleStart = moment.utc(start_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });
        let scheduleEnd = moment.utc(end_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });

        // Overnight handling
        if (scheduleEnd.isBefore(scheduleStart)) scheduleEnd.add(1, 'day');

        const isTimeMatch = now.isBetween(scheduleStart, scheduleEnd, null, '[]');

        // Recurrence check
        let isDayMatch = false;
        if (recurrence_rule.includes('FREQ=DAILY')) {
            isDayMatch = true;
        } else if (recurrence_rule.includes('FREQ=WEEKLY') && recurrence_rule.includes(`BYDAY=${todayCode}`)) {
            isDayMatch = true;
        } else if (recurrence_rule.includes('FREQ=MONTHLY')) {
            // optional: could check day of month if provided
            isDayMatch = true;
        } else if (recurrence_rule.includes('FREQ=ONCE')) {
            isDayMatch = now.isSame(moment.utc(start_date), 'day');
        }

        if (isTimeMatch && isDayMatch) {
            console.log(`✅ Active schedule found: ${schedule_name}. Device should run.`);
            return true;
        }
    }

    console.log(`❌ No active schedule found. Device should NOT run.`);
    return false;
}

module.exports = handleSchedule;
