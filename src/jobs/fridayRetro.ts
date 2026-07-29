import * as notion from '../clients/notion'
import * as claude from '../clients/claude'
import * as gmail from '../clients/gmail'

export async function runFridayRetro(): Promise<void> {
  console.log('[fridayRetro] starting')

  const [completed, open, goalsContent] = await Promise.all([
    notion.getCompletedThisWeek(),
    notion.getOpenThisWeek(),
    notion.getGoalsContent(),
  ])

  const retro = await claude.formatFridayRetro({ completed, open, goalsContent })

  const weekStart = getMonday()
  const subject = `Week of ${weekStart} - ${completed.length} done, ${open.length} carried`

  await gmail.sendEmail({
    to: process.env.MY_EMAIL ?? '',
    subject,
    body: retro,
  })

  console.log(`[fridayRetro] sent — ${subject}`)
}

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

if (require.main === module) runFridayRetro().catch(console.error)
