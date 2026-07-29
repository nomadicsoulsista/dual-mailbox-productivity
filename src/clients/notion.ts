import { Client } from '@notionhq/client'
import * as dotenv from 'dotenv'
import type {
  Task, CreateTaskInput, Contact, CreateJournalInput,
  Priority, WeekBucket, WorkBlock, TaskArea, TaskSource, TaskStatus,
  TouchCadence, ContactCategory, Mood,
} from '../types'

dotenv.config()

const notion = new Client({ auth: process.env.NOTION_TOKEN })

const DB = {
  tasks:    process.env.NOTION_TASKS_DB    ?? '',
  contacts: process.env.NOTION_CONTACTS_DB ?? '',
  journal:  process.env.NOTION_JOURNAL_DB  ?? '',
}

const GOALS_PAGE = process.env.NOTION_GOALS_PAGE ?? ''

// ── helpers ──────────────────────────────────────────────

function prop(page: any, name: string): any {
  return page.properties?.[name]
}

function textVal(page: any, name: string): string {
  return prop(page, name)?.rich_text?.[0]?.plain_text ?? ''
}

function titleVal(page: any, name: string): string {
  return prop(page, name)?.title?.[0]?.plain_text ?? ''
}

function selectVal(page: any, name: string): string {
  return prop(page, name)?.select?.name ?? ''
}

function multiSelectVals(page: any, name: string): string[] {
  return prop(page, name)?.multi_select?.map((o: any) => o.name) ?? []
}

function dateVal(page: any, name: string): string | null {
  return prop(page, name)?.date?.start ?? null
}

function pageToTask(page: any): Task {
  return {
    pageId:       page.id,
    title:        titleVal(page, 'Task'),
    status:       selectVal(page, 'Status') as TaskStatus,
    priority:     (selectVal(page, 'Priority') || null) as Priority | null,
    dueDate:      dateVal(page, 'Due Date'),
    week:         (selectVal(page, 'Week') || null) as WeekBucket | null,
    workBlock:    (selectVal(page, 'Work Block') || null) as WorkBlock | null,
    area:         (selectVal(page, 'Area') || null) as TaskArea | null,
    project:      textVal(page, 'Project') || null,
    source:       (selectVal(page, 'Source') || null) as TaskSource | null,
    timeEstimate: textVal(page, 'Time Estimate') || null,
    notes:        textVal(page, 'Notes') || null,
    createdAt:    prop(page, 'Created')?.created_time ?? page.created_time ?? '',
  }
}

function buildTaskProperties(input: CreateTaskInput): Record<string, any> {
  const props: Record<string, any> = {
    Task: { title: [{ text: { content: input.title } }] },
  }
  if (input.priority)     props['Priority']      = { select: { name: input.priority } }
  if (input.dueDate)      props['Due Date']       = { date: { start: input.dueDate } }
  if (input.week)         props['Week']           = { select: { name: input.week } }
  if (input.workBlock)    props['Work Block']     = { select: { name: input.workBlock } }
  if (input.area)         props['Area']           = { select: { name: input.area } }
  if (input.source)       props['Source']         = { select: { name: input.source } }
  if (input.status)       props['Status']         = { select: { name: input.status } }
  if (input.project)      props['Project']        = { rich_text: [{ text: { content: input.project } }] }
  if (input.timeEstimate) props['Time Estimate']  = { rich_text: [{ text: { content: input.timeEstimate } }] }
  if (input.notes)        props['Notes']          = { rich_text: [{ text: { content: input.notes.slice(0, 2000) } }] }
  return props
}

// ── Tasks ─────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput): Promise<boolean> {
  // check for existing task with same title (case-insensitive)
  const existing: any = await notion.databases.query({
    database_id: DB.tasks,
    filter: { property: 'Task', title: { equals: input.title } },
    page_size: 1,
  })
  if (existing.results.length > 0) {
    console.log(`[notion] skipping duplicate: "${input.title}"`)
    return false
  }
  await notion.pages.create({
    parent: { database_id: DB.tasks },
    properties: buildTaskProperties({ status: 'Not Started', ...input }),
  })
  return true
}

async function queryTasks(filter: any, sorts?: any[]): Promise<Task[]> {
  const pages: any[] = []
  let cursor: string | undefined

  do {
    const res: any = await notion.databases.query({
      database_id: DB.tasks,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  return pages.map(pageToTask)
}

export async function getTodayTasks(): Promise<Task[]> {
  return queryTasks(
    {
      and: [
        { property: 'Due Date', date: { equals: new Date().toISOString().slice(0, 10) } },
        { or: [
          { property: 'Status', select: { equals: 'Not Started' } },
          { property: 'Status', select: { equals: 'In Progress' } },
        ]},
      ],
    },
    [{ property: 'Priority', direction: 'ascending' }]
  )
}

export async function getOverdueTasks(): Promise<Task[]> {
  return queryTasks(
    {
      and: [
        { property: 'Due Date', date: { before: new Date().toISOString().slice(0, 10) } },
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Status', select: { does_not_equal: 'Cancelled' } },
      ],
    },
    [{ property: 'Due Date', direction: 'ascending' }]
  )
}

export async function getAllActiveTasks(): Promise<Task[]> {
  return queryTasks({
    or: [
      { property: 'Status', select: { equals: 'Not Started' } },
      { property: 'Status', select: { equals: 'In Progress' } },
    ],
  })
}

export async function getThisWeekTasks(): Promise<Task[]> {
  return queryTasks({
    and: [
      { property: 'Week', select: { equals: 'This Week' } },
      { or: [
        { property: 'Status', select: { equals: 'Not Started' } },
        { property: 'Status', select: { equals: 'In Progress' } },
      ]},
    ],
  })
}

export async function getCompletedThisWeek(): Promise<Task[]> {
  const monday = getMonday()
  return queryTasks({
    and: [
      { property: 'Status', select: { equals: 'Done' } },
      { property: 'Created', created_time: { on_or_after: monday } },
    ],
  })
}

export async function getOpenThisWeek(): Promise<Task[]> {
  return queryTasks({
    and: [
      { property: 'Week', select: { equals: 'This Week' } },
      { or: [
        { property: 'Status', select: { equals: 'Not Started' } },
        { property: 'Status', select: { equals: 'In Progress' } },
      ]},
    ],
  })
}

export async function getThisWeekGoalTasks(): Promise<Task[]> {
  return queryTasks({
    and: [
      { property: 'Week', select: { equals: 'This Week' } },
      { property: 'Source', select: { equals: 'Goal' } },
      { or: [
        { property: 'Status', select: { equals: 'Not Started' } },
        { property: 'Status', select: { equals: 'In Progress' } },
      ]},
    ],
  })
}

export async function updateTaskNotes(pageId: string, appendText: string): Promise<void> {
  const page: any = await notion.pages.retrieve({ page_id: pageId })
  const existing = textVal(page, 'Notes')
  const updated = existing ? `${existing}\n\n${appendText}` : appendText
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Notes: { rich_text: [{ text: { content: updated.slice(0, 2000) } }] },
    },
  })
}

export async function updateTaskPriority(pageId: string, priority: Priority): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Priority: { select: { name: priority } } },
  })
}

// ── Contacts ──────────────────────────────────────────────

function pageToContact(page: any): Contact {
  return {
    pageId:       page.id,
    name:         titleVal(page, 'Name'),
    company:      textVal(page, 'Company'),
    role:         textVal(page, 'Role'),
    category:     (selectVal(page, 'Category') || null) as ContactCategory | null,
    lastTouched:  dateVal(page, 'Last Touched'),
    touchCadence: (selectVal(page, 'Touch Cadence') || null) as TouchCadence | null,
    nextAction:   textVal(page, 'Next Action') || null,
    linkedInUrl:  prop(page, 'LinkedIn URL')?.url ?? null,
    notes:        textVal(page, 'Notes') || null,
    priority:     (selectVal(page, 'Priority') || null) as Priority | null,
  }
}

export async function getAllContacts(): Promise<Contact[]> {
  if (!DB.contacts) return []
  const pages: any[] = []
  let cursor: string | undefined
  do {
    const res: any = await notion.databases.query({
      database_id: DB.contacts,
      start_cursor: cursor,
      page_size: 100,
    })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return pages.map(pageToContact)
}

// ── Journal ───────────────────────────────────────────────

export async function createJournalEntry(input: CreateJournalInput): Promise<void> {
  if (!DB.journal) {
    console.warn('NOTION_JOURNAL_DB not set — skipping journal write')
    return
  }

  const wins     = input.wins.map(w => `• ${w}`).join('\n')
  const friction = input.friction.map(f => `• ${f}`).join('\n')
  const insights = input.insights.map(i => `• ${i}`).join('\n')

  await notion.pages.create({
    parent: { database_id: DB.journal },
    properties: {
      Entry:            { title: [{ text: { content: `${input.date} — ${input.mood}` } }] },
      Date:             { date: { start: input.date } },
      Mood:             { select: { name: input.mood } },
      Themes:           { multi_select: input.themes.map(t => ({ name: t })) },
      'Goals Mentioned':{ multi_select: input.goalsMentioned.map(g => ({ name: g })) },
      'Prompt Type':    { select: { name: input.promptType } },
      Summary:          { rich_text: [{ text: { content: input.summary.slice(0, 2000) } }] },
      Wins:             { rich_text: [{ text: { content: wins.slice(0, 2000) } }] },
      Friction:         { rich_text: [{ text: { content: friction.slice(0, 2000) } }] },
      Insights:         { rich_text: [{ text: { content: insights.slice(0, 2000) } }] },
      'Evolution Note': { rich_text: [{ text: { content: input.evolutionNote.slice(0, 2000) } }] },
      'Prompt Used':    { rich_text: [{ text: { content: input.promptUsed.slice(0, 2000) } }] },
      'Full Transcript':{ rich_text: [{ text: { content: input.transcript.slice(0, 2000) } }] },
    },
  })
}

// ── Goals ─────────────────────────────────────────────────

export async function getGoalsContent(): Promise<string> {
  const page: any = await notion.pages.retrieve({ page_id: GOALS_PAGE })
  const blocks: any = await notion.blocks.children.list({ block_id: GOALS_PAGE })
  const lines: string[] = []
  for (const block of blocks.results) {
    const type = block.type
    const richText = block[type]?.rich_text ?? []
    const text = richText.map((rt: any) => rt.plain_text).join('')
    if (text) lines.push(text)
  }
  return lines.join('\n')
}

// ── Util ──────────────────────────────────────────────────

function getMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}
