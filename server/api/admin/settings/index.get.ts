import { getWeeklySchedule, listScheduleExceptions } from '../../../booking/schedule'
import { getBookingSettings } from '../../../booking/settings'
import { toStudioParts } from '../../../booking/time'

/** Everything on the settings screen: booking settings, weekly hours, upcoming exceptions. */
export default defineEventHandler(async () => {
  const db = useDb()
  const [settings, weekly, exceptions] = await Promise.all([
    getBookingSettings(db),
    getWeeklySchedule(db),
    listScheduleExceptions(db, toStudioParts(new Date()).date),
  ])
  return { settings, weekly, exceptions }
})
