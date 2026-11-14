import { getBookingSettings } from '../booking/settings'

/** «Правила студии» and «Политика конфиденциальности» texts, edited in the admin panel. */
export default defineEventHandler(async () => (await getBookingSettings(useDb())).legal)
