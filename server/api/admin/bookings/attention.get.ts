import { listBookingsNeedingAttention } from '../../../admin/queries'

export default defineEventHandler(() => listBookingsNeedingAttention(useDb()))
