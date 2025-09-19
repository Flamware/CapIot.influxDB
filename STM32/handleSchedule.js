const moment = require('moment');

/**
 * Determines if a device should be running based on a list of schedules.
 *
 * @param {Array<Schedule>} schedules - An array of schedule objects.
 * @returns {boolean} True if the device should be running, otherwise false.
 */
function handleSchedule(schedules) {
    // Get current time in UTC
    const now = moment.utc();
    const currentDayCode = now.format('dd').toUpperCase(); // "MO", "TU", etc.

    console.log(`--- Schedule Check ---`);
    console.log(`Current Time (UTC): ${now.format('YYYY-MM-DD HH:mm:ssZ')}`);
    console.log(`Current Day: ${currentDayCode}`);
    console.log(`----------------------\n`);
    console.log("Listing schedules:");
    console.log(JSON.stringify(schedules, null, 2));

    // 🔴 Step 1: Check exceptions first (top priority)
    for (const schedule of schedules) {
        if (!schedule.is_exception) continue;

        const { start_time, end_time, start_date, end_date } = schedule;

        // Skip if not active by date
        if (now.isBefore(moment.utc(start_date)) || now.isAfter(moment.utc(end_date))) {
            continue;
        }

        // Normalize today's start/end times
        const exceptionStart = moment.utc(start_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });
        const exceptionEnd = moment.utc(end_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });

        // Handle overnight exception
        if (exceptionEnd.isBefore(exceptionStart)) {
            exceptionEnd.add(1, 'day');
        }

        const isExceptionActive = now.isBetween(exceptionStart, exceptionEnd, null, '[]');
        if (isExceptionActive) {
            console.log(`\n🚫 Exception active: ${schedule.schedule_name}. Device must NOT run.`);
            return false; // immediate stop
        }
    }

    // 🟢 Step 2: Check normal schedules
    for (const schedule of schedules) {
        if (schedule.is_exception) continue; // already handled

        const { start_time, end_time, recurrence_rule, start_date, end_date } = schedule;

        // Skip expired or not-yet-active schedules
        if (now.isBefore(moment.utc(start_date)) || now.isAfter(moment.utc(end_date))) {
            continue;
        }

        // Normalize today's start/end times
        const scheduleStartTime = moment.utc(start_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });
        const scheduleEndTime = moment.utc(end_time).set({
            year: now.year(),
            month: now.month(),
            date: now.date()
        });

        // Handle overnight ranges
        if (scheduleEndTime.isBefore(scheduleStartTime)) {
            scheduleEndTime.add(1, 'day');
        }

        console.log(`Checking rule: ${recurrence_rule}`);
        console.log(`Time range: ${scheduleStartTime.format('YYYY-MM-DD HH:mm:ssZ')} - ${scheduleEndTime.format('YYYY-MM-DD HH:mm:ssZ')}`);

        // Check if within time window
        const isTimeMatch = now.isBetween(scheduleStartTime, scheduleEndTime, null, '[]');
        console.log(`- Time match: ${isTimeMatch}`);

        // Day/frequency matching
        const isDayMatch =
            recurrence_rule.includes(`BYDAY=${currentDayCode}`) ||
            recurrence_rule.includes('FREQ=DAILY') ||
            recurrence_rule.includes('FREQ=MONTHLY'); // optional refinement
        console.log(`- Day match: ${isDayMatch}`);

        if (isTimeMatch && isDayMatch) {
            console.log(`\n✅ Active schedule found. Device should run.`);
            return true;
        }
    }

    console.log(`\n❌ No active schedule found. Returning false.`);
    return false;
}

module.exports = handleSchedule;
