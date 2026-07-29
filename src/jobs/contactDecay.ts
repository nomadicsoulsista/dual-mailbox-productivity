import * as notion from '../clients/notion'
import type { Contact, CreateTaskInput, TouchCadence } from '../types'

const CADENCE_DAYS: Record<TouchCadence, number> = {
  'Weekly':    7,
  'Bi-weekly': 14,
  'Monthly':   30,
  'Quarterly': 90,
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function isDecayed(contact: Contact): boolean {
  const limit = contact.touchCadence ? CADENCE_DAYS[contact.touchCadence] : 21
  return daysSince(contact.lastTouched) >= limit
}

export async function runContactDecay(): Promise<void> {
  console.log('[contactDecay] starting')

  const contacts = await notion.getAllContacts()
  if (!contacts.length) {
    console.log('[contactDecay] no contacts found — is NOTION_CONTACTS_DB set?')
    return
  }

  const decayed = contacts.filter(isDecayed)
  console.log(`[contactDecay] ${decayed.length} / ${contacts.length} contacts need outreach`)

  for (const contact of decayed) {
    const days = daysSince(contact.lastTouched)
    const notes = [
      `👤 ${contact.role} at ${contact.company}`,
      `🎯 ${contact.nextAction ?? 'Maintain relationship'}`,
      `📅 Last touched: ${contact.lastTouched ?? 'never'} (${days === 9999 ? 'never' : days + ' days ago'})`,
      contact.linkedInUrl ? `🔗 ${contact.linkedInUrl}` : '',
    ].filter(Boolean).join('\n')

    const task: CreateTaskInput = {
      title:        `Reach out to ${contact.name} (${contact.company})`,
      priority:     contact.priority ?? 'Medium',
      dueDate:      new Date().toISOString().slice(0, 10),
      week:         'This Week',
      area:         'Work',
      source:       'Goal',
      status:       'Not Started',
      timeEstimate: '15 min',
      notes,
    }
    await notion.createTask(task)
    console.log(`[contactDecay] task created for ${contact.name}`)
  }

  console.log('[contactDecay] done')
}

if (require.main === module) runContactDecay().catch(console.error)
