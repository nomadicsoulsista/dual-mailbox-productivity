export interface GmailAccount {
  label: string
  clientId: string
  clientSecret: string
  refreshToken: string
  email: string
}

export interface EmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body: string
  accountLabel: string
}

// ── Notion Task ──────────────────────────────────────────
export type Priority    = 'High' | 'Medium' | 'Low'
export type WeekBucket  = 'This Week' | 'Next Week' | 'Someday'
export type WorkBlock   = 'AM Work Block' | 'PM Work Block'
export type TaskStatus  = 'Not Started' | 'In Progress' | 'Done' | 'Cancelled'
export type TaskArea    = 'Work' | 'Personal'
export type TaskSource  = 'Email' | 'Calendar' | 'Goal' | 'Manual' | 'Review'

export interface Task {
  pageId: string
  title: string
  status: TaskStatus
  priority: Priority | null
  dueDate: string | null
  week: WeekBucket | null
  workBlock: WorkBlock | null
  area: TaskArea | null
  project: string | null
  source: TaskSource | null
  timeEstimate: string | null
  notes: string | null
  createdAt: string
}

export interface CreateTaskInput {
  title: string
  priority?: Priority
  dueDate?: string | null
  week?: WeekBucket
  workBlock?: WorkBlock | null
  area?: TaskArea
  project?: string
  source?: TaskSource
  status?: TaskStatus
  timeEstimate?: string | null
  notes?: string
}

// ── Notion Contact ───────────────────────────────────────
export type ContactCategory = 'Pharma' | 'Biotech' | 'Potential Client' | 'Recruiter' | 'Peer'
export type TouchCadence    = 'Weekly' | 'Bi-weekly' | 'Monthly' | 'Quarterly'

export interface Contact {
  pageId: string
  name: string
  company: string
  role: string
  category: ContactCategory | null
  lastTouched: string | null
  touchCadence: TouchCadence | null
  nextAction: string | null
  linkedInUrl: string | null
  notes: string | null
  priority: Priority | null
}

// ── Notion Journal ───────────────────────────────────────
export type Mood        = 'reflective' | 'energized' | 'frustrated' | 'uncertain' | 'focused' | 'grateful' | 'anxious' | 'proud'
export type PromptType  = 'daily' | 'weekly' | 'monthly'

export interface CreateJournalInput {
  date: string
  mood: Mood
  themes: string[]
  goalsMentioned: string[]
  summary: string
  wins: string[]
  friction: string[]
  insights: string[]
  evolutionNote: string
  promptUsed: string
  promptType: PromptType
  transcript: string
}

// ── AI output shapes ─────────────────────────────────────
export interface EmailClassification {
  actionRequired: boolean
  taskTitle: string
  priority: Priority
  dueDate: string | null
  dueConfidence: 'exact' | 'inferred' | 'none'
  weekBucket: WeekBucket
  area: TaskArea
  workBlock: WorkBlock | null
  timeEstimate: string | null
  goalAlignment: string
  reasoning: string
}

export interface GapTask {
  taskTitle: string
  priority: Priority
  dueDate: string | null
  weekBucket: WeekBucket
  area: TaskArea
  timeEstimate: string | null
  goalAlignment: string
  reasoning: string
}

export interface StaleTask {
  taskTitle: string
  priority: Priority
  daysOld: number
  staleReason: string
}

export interface GapAnalysis {
  gapTasks: GapTask[]
  staleTasks: StaleTask[]
}

export interface JournalInsights {
  summary: string
  mood: Mood
  themes: string[]
  wins: string[]
  friction: string[]
  insights: string[]
  actionItems: string[]
  goalsMentioned: string[]
  evolutionNote: string
}

export interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  attendees: string[]
}
