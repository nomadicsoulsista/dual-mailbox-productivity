import * as notion from '../clients/notion'
import * as calendar from '../clients/calendar'
import * as claude from '../clients/claude'
import * as gmail from '../clients/gmail'

export async function runMorningBrief(): Promise<void> {
  console.log('[morningBrief] starting')

  const [todayTasks, overdueTasks, events] = await Promise.all([
    notion.getTodayTasks(),
    notion.getOverdueTasks(),
    calendar.getTodayEvents(),
  ])

  const brief = await claude.formatMorningBrief({ todayTasks, overdueTasks, events })

  const today = new Date()
  const label = today.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
  const subject = `${label} - ${todayTasks.length} tasks | ${overdueTasks.length} overdue`

  await gmail.sendEmail({
    to: process.env.MY_EMAIL ?? '',
    subject,
    body: brief,
  })

  console.log(`[morningBrief] sent — ${subject}`)
}

if (require.main === module) runMorningBrief().catch(console.error)
