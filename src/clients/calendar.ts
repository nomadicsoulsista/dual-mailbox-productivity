import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as dotenv from 'dotenv'
import type { CalendarEvent } from '../types'

dotenv.config()

function buildClient(): OAuth2Client {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_ACCOUNT1_REFRESH_TOKEN })
  return auth
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const auth = buildClient()
  const cal = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setHours(23, 59, 59, 999)

  const res = await cal.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items ?? []).map(e => ({
    id: e.id ?? '',
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    attendees: (e.attendees ?? []).map(a => a.email ?? '').filter(Boolean),
  }))
}
