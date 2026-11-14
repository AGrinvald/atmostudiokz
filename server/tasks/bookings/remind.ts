export default defineTask({
  meta: { name: 'bookings:remind', description: 'Send Telegram reminders before confirmed sessions' },
  async run() {
    return { result: { sent: await useNotifier().sendReminders() } }
  },
})
