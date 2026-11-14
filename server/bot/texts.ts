// Russian copy for the Telegram bot and Telegram notifications (SPEC §5, §7).
import { formatHour, formatKzt, formatPhone, formatStudioDate, formatStudioTime } from '../../shared/format'
import type { Booking } from '../db'
import { toStudioParts } from '../booking/time'

export const STUDIO = {
  name: 'ATMO studio',
  address: 'Алматы, ул. Алатау 36, блок 1',
  phone: '+7 777 609 03 17',
  instagram: 'https://www.instagram.com/atmo_studio_26/',
  map: 'https://2gis.kz/almaty/search/Алатау%2036',
}

export const MENU = {
  book: '📅 Записаться',
  my: '🗂 Мои записи',
  about: 'ℹ️ О студии',
}

export const LABELS = {
  session: { '30': '30 минут', '55': '55 минут' } as Record<string, string>,
  lighting: { dark: 'Тёмный', bright: 'Светлый' } as Record<string, string>,
  background: { white: 'Белый', black: 'Чёрный', red: 'Красный' } as Record<string, string>,
  source: { site: 'сайт', bot: 'Telegram', admin: 'админ' } as Record<string, string>,
  status: {
    awaiting_payment: '⏳ Ожидает оплаты',
    payment_claimed: '🔎 Проверяем оплату',
    confirmed: '✅ Подтверждена',
    expired: '⌛ Время на оплату истекло',
    rejected: '❌ Оплата не найдена',
    cancelled: 'Отменена',
    cancelled_refund_pending: 'Отменена — возврат в обработке',
    refunded: 'Отменена — деньги возвращены',
    completed: 'Состоялась',
  } as Record<string, string>,
}

/** Escapes user-provided text for Telegram's HTML parse mode. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const when = (b: Pick<Booking, 'slotStart'>) => {
  const p = toStudioParts(b.slotStart)
  return `${formatStudioDate(p.date)}, ${formatHour(p.hour)}`
}

export function bookingSummary(b: Pick<Booking, 'slotStart' | 'sessionType' | 'lighting' | 'background' | 'peopleCount' | 'priceTotal'>) {
  return [
    `📅 ${when(b)}`,
    `⏱ ${LABELS.session[b.sessionType]} (бронируется целый час)`,
    `💡 Свет: ${LABELS.lighting[b.lighting]} · фон: ${LABELS.background[b.background]}`,
    `👥 ${b.peopleCount} чел.`,
    `💰 ${formatKzt(b.priceTotal)}`,
  ].join('\n')
}

export const T = {
  welcome:
    `Привет! Это ${STUDIO.name} — студия автопортрета.\nТы, свет и камера. 📸\n\n` +
    'Здесь можно записаться на сессию, оплатить её через Kaspi и посмотреть свои записи.',
  help: 'Выберите действие в меню ниже 👇',
  about:
    `<b>${STUDIO.name}</b> — студия автопортрета в Алматы.\n` +
    'Вы снимаете себя сами с пульта: свет и камера уже настроены.\n' +
    'Безлимит фото в лёгкой обработке — цветные и чёрно-белые.\n\n' +
    `📍 ${STUDIO.address}\n📞 ${STUDIO.phone}`,
  aboutMap: '🗺 Открыть карту',
  aboutInstagram: 'Instagram',
  aboutSite: 'Сайт',

  paymentUnavailable: `Онлайн-оплата временно недоступна. Запишитесь по телефону ${STUDIO.phone}.`,
  pickDate: 'Выберите дату:',
  noDates: 'Свободных дат пока нет. Позвоните нам: ' + STUDIO.phone,
  pickHour: (date: string) => `${formatStudioDate(date)}\nВыберите время:`,
  slotGone: 'Это время только что заняли. Выберите другое.',
  pickSession: (date: string, hour: number) =>
    `${formatStudioDate(date)}, ${formatHour(hour)}\n\nВыберите длительность.\nБронируется целый час — даже для 30 минут.`,
  pickLighting: 'Какой свет?',
  pickBackground: 'Какой фон? (остальные — скоро)',
  pickPeople: (included: number, extra: number, max: number) =>
    `Сколько человек?\nДо ${included} — без доплаты, каждый следующий +${formatKzt(extra)}, максимум ${max}.`,
  askContact: 'Поделитесь номером телефона — по нему мы найдём вашу запись.',
  shareContact: '📱 Поделиться номером',
  notYourContact: 'Пожалуйста, поделитесь своим номером кнопкой ниже.',
  badPhone: `Этот номер не подходит — нужен номер +7. Если что-то не так, позвоните нам: ${STUDIO.phone}.`,
  askName: (suggested?: string) =>
    suggested ? `Как к вам обращаться? Нажмите «${suggested}» или напишите имя.` : 'Как к вам обращаться? Напишите имя.',
  badName: 'Напишите имя одним сообщением (до 100 символов).',
  confirmTitle: 'Проверьте запись:',
  confirmFooter: (siteUrl: string) =>
    `\n\nНажимая «Подтвердить», вы соглашаетесь с <a href="${siteUrl}/rules">правилами студии</a> ` +
    `и <a href="${siteUrl}/privacy">обработкой персональных данных</a>.`,
  confirm: '✅ Подтвердить',
  restart: '↩️ Начать заново',
  back: '← Назад',
  draftExpired: 'Запись не завершена. Начните заново — «Записаться».',

  payment: (b: Booking, deadline: Date) =>
    `Бронь <b>${b.number}</b> создана.\n\n${bookingSummary(b)}\n\n` +
    '<b>Оплата через Kaspi</b>\n' +
    `1. Откройте ссылку ниже или QR\n2. Сумма: <b>${formatKzt(b.priceTotal)}</b>\n` +
    `3. В комментарии укажите <b>${b.number}</b>\n4. Нажмите «Я оплатил»\n\n` +
    `Оплатите до ${formatStudioTime(deadline.toISOString())} — иначе время освободится.`,
  payKaspi: '💳 Оплатить в Kaspi',
  claimPayment: '✅ Я оплатил',
  paymentClaimed: (b: Booking) => `Спасибо! Проверяем оплату по брони ${b.number} — напишем, как только подтвердим.`,
  paymentWindowExpired: 'Время на оплату истекло, бронь отменена. Запишитесь заново.',

  myEmpty: 'У вас пока нет записей.',
  myTitle: 'Ваши записи:',
  myItem: (b: Booking) => `<b>${b.number}</b> · ${LABELS.status[b.status]}\n${bookingSummary(b)}`,
  cancel: (number: string) => `Отменить ${number}`,
  cancelConfirm: (b: Booking) =>
    `Отменить запись ${b.number} (${when(b)})?` +
    (b.status === 'awaiting_payment' ? '' : '\nДеньги вернём на Kaspi.'),
  cancelYes: 'Да, отменить',
  cancelNo: 'Нет',
  cancelled: (b: Booking) =>
    `Запись ${b.number} отменена.` + (b.status === 'cancelled_refund_pending' ? ' Деньги вернём на Kaspi в ближайшее время.' : ''),
  cancelCutoff: (hours: number) => `Отменить онлайн можно не позднее чем за ${hours} часа. Позвоните нам: ${STUDIO.phone}.`,
  notFound: 'Запись не найдена.',
  changed: 'Статус записи изменился. Откройте «Мои записи».',
  error: 'Что-то пошло не так. Попробуйте ещё раз или позвоните нам: ' + STUDIO.phone,

  // Client notifications
  confirmedClient: (b: Booking) =>
    `✅ Запись ${b.number} подтверждена!\nЖдём вас ${when(b)}.\n📍 ${STUDIO.address}`,
  rejectedClient: (b: Booking) =>
    `❌ Мы не нашли оплату по брони ${b.number}, время освобождено.\nЕсли вы оплатили — позвоните нам: ${STUDIO.phone}.`,
  expiredClient: (b: Booking) => `⌛ Время на оплату брони ${b.number} истекло, время освобождено.`,
  movedClient: (b: Booking) => `🔁 Ваша запись ${b.number} перенесена на ${when(b)}.`,
  cancelledByStudioClient: (b: Booking) =>
    `Запись ${b.number} (${when(b)}) отменена студией.` +
    (b.status === 'cancelled_refund_pending' ? ' Деньги вернём на Kaspi.' : '') +
    `\nВопросы: ${STUDIO.phone}`,
  refundedClient: (b: Booking) => `💸 Деньги по брони ${b.number} возвращены на Kaspi.`,
  photosClient: (b: Booking, link: string) =>
    `📸 Ваши фото с сессии ${b.number} готовы!\n${link}\n\nСпасибо, что были у нас ♥`,
  reminderClient: (b: Booking) =>
    `⏰ Напоминаем: ${when(b)} ваша сессия в ${STUDIO.name}.\n📍 ${STUDIO.address}`,

  // Admin notifications
  adminLinked: '✅ Этот чат подключён для уведомлений о записях.',
  adminNew: (b: Booking, client: { name: string; phone: string }) =>
    `🆕 Новая бронь <b>${b.number}</b> (${LABELS.source[b.source]})\n${esc(client.name)}, ${formatPhone(client.phone)}\n${bookingSummary(b)}\n${LABELS.status[b.status]}`,
  adminClaimed: (b: Booking, client: { name: string; phone: string }) =>
    `💳 Клиент нажал «Я оплатил»: <b>${b.number}</b>\n${esc(client.name)}, ${formatPhone(client.phone)}\n` +
    `Сумма: <b>${formatKzt(b.priceTotal)}</b> — проверьте поступление в Kaspi.\n${when(b)}`,
  adminCancelled: (b: Booking, client: { name: string; phone: string }) =>
    `↩️ Клиент отменил <b>${b.number}</b> (${when(b)})\n${esc(client.name)}, ${formatPhone(client.phone)}` +
    (b.status === 'cancelled_refund_pending' ? `\nНужно вернуть <b>${formatKzt(b.priceTotal)}</b> в Kaspi.` : ''),
  adminConfirm: '✅ Оплата получена',
  adminReject: '❌ Оплаты нет',
  adminDecided: (ok: boolean) => (ok ? '\n\n✅ Оплата подтверждена' : '\n\n❌ Оплата отклонена'),
  adminDecisionFailed: 'Статус уже изменился — откройте админ-панель.',
}
