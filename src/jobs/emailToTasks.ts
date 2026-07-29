import * as gmail from '../clients/gmail'
import * as notion from '../clients/notion'
import * as claude from '../clients/claude'
import type { CreateTaskInput } from '../types'

export async function runEmailToTasks(): Promise<void> {
  console.log('[emailToTasks] starting')
  const accounts = gmail.getAccounts()

  const sinceMs = process.env.SINCE_HOURS
    ? Date.now() - parseInt(process.env.SINCE_HOURS) * 60 * 60 * 1000
    : Date.now() - 24 * 60 * 60 * 1000

  const allEmails = (
    await Promise.all(accounts.map(a => gmail.fetchUnread(a, sinceMs)))
  ).flat()

  console.log(`[emailToTasks] ${allEmails.length} unread emails`)
  if (!allEmails.length) return

  for (const email of allEmails) {
    try {
      const result = await claude.classifyEmail(email)

      if (result.actionRequired) {
        const notes = [
          `📬 From: ${email.from}`,
          `📅 Received: ${email.date}`,
          `📂 Account: ${email.accountLabel}`,
          `🎯 Goal: ${result.goalAlignment}`,
          `📊 Due confidence: ${result.dueConfidence}`,
          ``,
          `🧠 Why: ${result.reasoning}`,
          ``,
          `Subject: ${email.subject}`,
        ].join('\n')

        const task: CreateTaskInput = {
          title:        result.taskTitle,
          priority:     result.priority,
          dueDate:      result.dueDate,
          week:         result.weekBucket,
          area:         result.area,
          workBlock:    result.workBlock ?? undefined,
          timeEstimate: result.timeEstimate ?? undefined,
          source:       'Email',
          status:       'Not Started',
          notes,
        }

        await notion.createTask(task)
        console.log(`[emailToTasks] created: "${result.taskTitle}"`)
      }

      // mark processed on both accounts — find which account this email belongs to
      const account = accounts.find(a => a.label === email.accountLabel) ?? accounts[0]
      await gmail.applyLabel(account, email.id, 'productivity-processed')

    } catch (err) {
      console.error(`[emailToTasks] error processing ${email.id}:`, err)
    }
  }

  console.log('[emailToTasks] done')
}

// run directly: npx ts-node src/jobs/emailToTasks.ts
if (require.main === module) runEmailToTasks().catch(console.error)
