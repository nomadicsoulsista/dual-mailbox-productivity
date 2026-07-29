import * as notion from '../clients/notion'
import type { CreateTaskInput } from '../types'

const HABITS: CreateTaskInput[] = [
  {
    title:        'Write and publish one LinkedIn post',
    priority:     'High',
    week:         'This Week',
    workBlock:    'AM Work Block',
    area:         'Work',
    source:       'Goal',
    status:       'Not Started',
    timeEstimate: '45 min',
    notes:        '🔁 Weekly habit — pharma brand / personal brand goal',
  },
  {
    title:        'Reach out to 2 pharma contacts (warm or cold)',
    priority:     'High',
    week:         'This Week',
    workBlock:    'AM Work Block',
    area:         'Work',
    source:       'Goal',
    status:       'Not Started',
    timeEstimate: '30 min',
    notes:        '🔁 Weekly habit — pharma network goal',
  },
  {
    title:        'Griot of Kin: 1 focused work session',
    priority:     'Medium',
    week:         'This Week',
    workBlock:    'PM Work Block',
    area:         'Work',
    source:       'Goal',
    status:       'Not Started',
    timeEstimate: '60 min',
    notes:        '🔁 Weekly habit — Griot of Kin launch goal',
  },
]

export async function runHabitSeeder(): Promise<void> {
  console.log('[habitSeeder] starting')

  // check what goal tasks already exist this week to avoid duplicates
  const existing = await notion.getThisWeekGoalTasks()
  const existingTitles = new Set(existing.map(t => t.title.toLowerCase()))

  for (const habit of HABITS) {
    if (existingTitles.has(habit.title.toLowerCase())) {
      console.log(`[habitSeeder] already exists: "${habit.title}"`)
      continue
    }
    await notion.createTask({
      ...habit,
      notes: `${habit.notes}\n📅 Seeded ${new Date().toISOString().slice(0, 10)}`,
    })
    console.log(`[habitSeeder] seeded: "${habit.title}"`)
  }

  console.log('[habitSeeder] done')
}

if (require.main === module) runHabitSeeder().catch(console.error)
