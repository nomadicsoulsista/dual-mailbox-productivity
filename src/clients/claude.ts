import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import type {
  EmailMessage, EmailClassification, GapAnalysis,
  JournalInsights, Task, CalendarEvent,
} from '../types'

dotenv.config()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5'

const GOALS = `
1. Expand and nurture network, especially at pharmaceutical companies
2. Increase income via new business or high-paying job
3. Launch and get users for Griot of Kin
4. Improve personal brand via LinkedIn and Substack
`.trim()

const STANDING_RULES = `
- ALWAYS flag emails requiring same-day response as urgent
- High priority = directly advances a top goal OR hard deadline within 48 hours
- Low priority = informational, newsletters, FYI-only
- IGNORE and set action_required=false for recurring calendar invites and reminders (e.g. "RSVP to weekly networking meeting", standing meetings, recurring events)
- IGNORE and set action_required=false for all automated job notification emails (e.g. "Jobs you may be interested in", "New jobs for you", "Your job alert", "Recommended jobs", job board alerts from LinkedIn, Indeed, ZipRecruiter, Glassdoor, or any recruiter platform) — UNLESS the email is written personally by an individual human recruiter or hiring manager reaching out directly
- IGNORE and set action_required=false for marketing and promotional emails (e.g. sales, discounts, product announcements, newsletters, "unsubscribe" footers, no-reply senders, bulk promotional content)
`.trim()

function today(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

async function jsonCall<T>(system: string, user: string, maxTokens = 2048): Promise<T> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON in Claude response: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(match[0]) as T
  } catch {
    // truncated JSON — attempt to recover by closing open structures
    let s = match[0]
    const opens = (s.match(/\[/g) ?? []).length - (s.match(/\]/g) ?? []).length
    const openBraces = (s.match(/\{/g) ?? []).length - (s.match(/\}/g) ?? []).length
    // remove trailing incomplete object
    s = s.replace(/,\s*\{[^}]*$/, '')
    for (let i = 0; i < openBraces; i++) s += '}'
    for (let i = 0; i < opens; i++) s += ']'
    return JSON.parse(s) as T
  }
}

// ── Email classification ──────────────────────────────────

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export async function classifyEmail(
  email: EmailMessage,
  recentTasks: Task[] = []
): Promise<EmailClassification> {
  const examplesBlock = recentTasks.length > 0
    ? `\nPast tasks (learn from how these were classified — priority, area, time estimate patterns):\n` +
      recentTasks
        .slice(0, 15)
        .map(t => `- [${t.priority ?? 'Medium'}] [${t.area ?? 'Work'}] ${t.title}${t.timeEstimate ? ` | ${t.timeEstimate}` : ''}${t.dueDate ? ` | due ${t.dueDate}` : ''}`)
        .join('\n')
    : ''

  const system = `You are a task extraction assistant. Today is ${today()}.

Goals:
${GOALS}

${STANDING_RULES}

Only mark action_required=true if the email genuinely requires the user to DO something.
Infer due dates from: explicit dates, urgency language, dependencies, business context.
When no date is mentioned: Urgent→today, High→+2 days, Medium→this week, Low→next week.
If truly no due date can be inferred, set due_date to null — a default will be applied.
${examplesBlock}
Return ONLY valid JSON matching this shape:
{
  "action_required": bool,
  "task_title": string,
  "priority": "High"|"Medium"|"Low",
  "due_date": "YYYY-MM-DD"|null,
  "due_confidence": "exact"|"inferred"|"none",
  "week_bucket": "This Week"|"Next Week"|"Someday",
  "area": "Work"|"Personal",
  "work_block": "AM Work Block"|"PM Work Block"|null,
  "time_estimate": string|null,
  "goal_alignment": string,
  "reasoning": string
}`

  const user = `From: ${email.from}
To: ${email.to}
Date: ${email.date}
Subject: ${email.subject}
Account: ${email.accountLabel}

Body:
${(email.body || email.snippet).slice(0, 3000)}`

  interface RawClassification {
    action_required: boolean
    task_title: string
    priority: string
    due_date: string | null
    due_confidence: string
    week_bucket: string
    area: string
    work_block: string | null
    time_estimate: string | null
    goal_alignment: string
    reasoning: string
  }

  const raw = await jsonCall<RawClassification>(system, user)
  return {
    actionRequired: raw.action_required,
    taskTitle: raw.task_title,
    priority: raw.priority as EmailClassification['priority'],
    dueDate: raw.due_date ?? defaultDueDate(),
    dueConfidence: raw.due_date ? raw.due_confidence as EmailClassification['dueConfidence'] : 'none',
    weekBucket: raw.week_bucket as EmailClassification['weekBucket'],
    area: raw.area as EmailClassification['area'],
    workBlock: raw.work_block as EmailClassification['workBlock'],
    timeEstimate: raw.time_estimate,
    goalAlignment: raw.goal_alignment,
    reasoning: raw.reasoning,
  }
}

// ── Gap analysis ──────────────────────────────────────────

export async function analyzeGoalGaps(tasks: Task[], goalsContent: string): Promise<GapAnalysis> {
  const taskSummary = tasks
    .map(t => `- [${t.status}] ${t.title} | ${t.priority ?? 'no priority'} | Due: ${t.dueDate ?? 'none'} | Created: ${t.createdAt.slice(0, 10)}`)
    .join('\n')

  const system = `You are a strategic productivity advisor. Today is ${today()}.

Goals and context:
${goalsContent}

Analyze the task list for:
1. GAP TASKS: important actions MISSING to advance the goals (max 5, specific and actionable)
2. STALE TASKS: High+NotStarted >3 days old, Medium+NotStarted >7 days, or past due date

Return ONLY valid JSON:
{
  "gap_tasks": [{
    "task_title": string,
    "priority": "High"|"Medium"|"Low",
    "due_date": "YYYY-MM-DD"|null,
    "week_bucket": "This Week"|"Next Week"|"Someday",
    "area": "Work"|"Personal",
    "time_estimate": string|null,
    "goal_alignment": string,
    "reasoning": string
  }],
  "stale_tasks": [{
    "task_title": string,
    "priority": "High"|"Medium"|"Low",
    "days_old": number,
    "stale_reason": string
  }]
}`

  interface RawGap {
    gap_tasks: Array<{
      task_title: string; priority: string; due_date: string | null
      week_bucket: string; area: string; time_estimate: string | null
      goal_alignment: string; reasoning: string
    }>
    stale_tasks: Array<{ task_title: string; priority: string; days_old: number; stale_reason: string }>
  }

  const raw = await jsonCall<RawGap>(system, `Active tasks (${tasks.length}):\n\n${taskSummary}`, 4096)

  return {
    gapTasks: raw.gap_tasks.map(g => ({
      taskTitle: g.task_title,
      priority: g.priority as GapAnalysis['gapTasks'][0]['priority'],
      dueDate: g.due_date,
      weekBucket: g.week_bucket as GapAnalysis['gapTasks'][0]['weekBucket'],
      area: g.area as GapAnalysis['gapTasks'][0]['area'],
      timeEstimate: g.time_estimate,
      goalAlignment: g.goal_alignment,
      reasoning: g.reasoning,
    })),
    staleTasks: raw.stale_tasks.map(s => ({
      taskTitle: s.task_title,
      priority: s.priority as GapAnalysis['staleTasks'][0]['priority'],
      daysOld: s.days_old,
      staleReason: s.stale_reason,
    })),
  }
}

// ── Morning brief ─────────────────────────────────────────

export async function formatMorningBrief(params: {
  todayTasks: Task[]
  overdueTasks: Task[]
  events: CalendarEvent[]
}): Promise<string> {
  const { todayTasks, overdueTasks, events } = params

  const system = `You are a direct, no-filler executive assistant. Today is ${today()}.
Goals: pharma network, personal brand (LinkedIn/Substack), income growth, Griot of Kin launch.
Preferences: direct and concise, short bullets, no filler, flag anything urgent at top.

Write a plain-text morning brief. Sections:
URGENT — only if overdue or high-priority due today
TODAY — bulleted task list with time estimates, sorted by priority
CALENDAR — today's meetings; flag back-to-back conflicts
ONE THING — the single most important action for their goals today (specific)

Under 20 lines total. No pleasantries, no sign-off.`

  const taskLines = todayTasks.map(t => `- ${t.title} [${t.priority}] ${t.timeEstimate ?? ''}`).join('\n')
  const overdueLines = overdueTasks.map(t => `- ${t.title} [${t.priority}] due ${t.dueDate}`).join('\n')
  const eventLines = events.map(e => `- ${e.start.slice(11, 16)} ${e.summary}`).join('\n')

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{
      role: 'user',
      content: `Overdue (${overdueTasks.length}):\n${overdueLines || 'none'}\n\nToday's tasks (${todayTasks.length}):\n${taskLines || 'none'}\n\nCalendar:\n${eventLines || 'no events'}`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ── Friday retrospective ──────────────────────────────────

export async function formatFridayRetro(params: {
  completed: Task[]
  open: Task[]
  goalsContent: string
}): Promise<string> {
  const { completed, open, goalsContent } = params

  const system = `You are a direct strategic advisor doing a weekly review. Today is ${today()}.

Goals and context:
${goalsContent}

Write a plain-text retrospective. Sections:
WON THIS WEEK — completed tasks, one bullet each
LEFT ON THE TABLE — open tasks, flag high-priority ones
GOAL COVERAGE — rate each goal: ✓ moved / ~ partial / ✗ stalled (with evidence)
PATTERN NOTICE — one honest observation about what keeps getting skipped
NEXT WEEK'S ONE THING — single most important thing to protect time for

Tone: direct, no filler, no cheerleading. Under 25 lines.`

  const completedLines = completed.map(t => `- ${t.title}`).join('\n')
  const openLines = open.map(t => `- ${t.title} [${t.priority}]`).join('\n')

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system,
    messages: [{
      role: 'user',
      content: `Completed this week (${completed.length}):\n${completedLines || 'none'}\n\nStill open (${open.length}):\n${openLines || 'none'}`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text : ''
}

// ── Journal insights ──────────────────────────────────────

export async function extractJournalInsights(
  transcript: string,
  promptUsed: string,
  promptType: string,
  timestamp: string
): Promise<JournalInsights> {
  const system = `You are processing a personal voice journal entry. Today is ${timestamp}.
The entry was recorded in response to: "${promptUsed}" (type: ${promptType}).
Use the prompt as interpretive context.

Return ONLY valid JSON:
{
  "summary": string,
  "mood": "reflective"|"energized"|"frustrated"|"uncertain"|"focused"|"grateful"|"anxious"|"proud",
  "themes": string[],
  "wins": string[],
  "friction": string[],
  "insights": string[],
  "action_items": string[],
  "goals_mentioned": string[],
  "evolution_note": string
}`

  interface RawInsights {
    summary: string; mood: string; themes: string[]; wins: string[]
    friction: string[]; insights: string[]; action_items: string[]
    goals_mentioned: string[]; evolution_note: string
  }

  const raw = await jsonCall<RawInsights>(system, `Transcript:\n${transcript}`)
  return {
    summary: raw.summary,
    mood: raw.mood as JournalInsights['mood'],
    themes: raw.themes,
    wins: raw.wins,
    friction: raw.friction,
    insights: raw.insights,
    actionItems: raw.action_items,
    goalsMentioned: raw.goals_mentioned,
    evolutionNote: raw.evolution_note,
  }
}
