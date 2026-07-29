import * as dotenv from 'dotenv'
dotenv.config()

import cron from 'node-cron'
import express from 'express'
import { runEmailToTasks } from './jobs/emailToTasks'
import { runGapReview }    from './jobs/gapReview'
import { runMorningBrief } from './jobs/morningBrief'
import { runHabitSeeder }  from './jobs/habitSeeder'
import { runContactDecay } from './jobs/contactDecay'
import { runFridayRetro }  from './jobs/fridayRetro'
import { voiceJournalRoute, upload } from './webhook/voiceJournal'

// ── Scheduled jobs ────────────────────────────────────────
cron.schedule('30 6 * * 1',   wrap('habitSeeder',  runHabitSeeder))   // Mon 6:30am
cron.schedule('55 6 * * 1-5', wrap('morningBrief', runMorningBrief))  // Mon–Fri 6:55am
cron.schedule('0 7 * * 1',    wrap('gapReview',    runGapReview))     // Mon 7:00am
cron.schedule('0 */4 * * 1-5',  wrap('emailToTasks', runEmailToTasks))  // every 4 hours, weekdays
cron.schedule('0 8 * * 3',    wrap('contactDecay', runContactDecay))  // Wed 8:00am
cron.schedule('0 16 * * 5',   wrap('fridayRetro',  runFridayRetro))   // Fri 4:00pm

function wrap(name: string, fn: () => Promise<void>) {
  return () => fn().catch(err => console.error(`[${name}] uncaught error:`, err))
}

// ── Webhook server ────────────────────────────────────────
const app = express()
// use raw body for voice-journal so we can sanitize base64 before JSON parsing
app.use('/voice-journal', express.text({ type: 'application/json', limit: '50mb' }))
app.use(express.json({ limit: '50mb' }))

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
app.post('/voice-journal', upload.single('audio'), voiceJournalRoute)

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)
  console.log('[server] scheduled jobs registered:')
  console.log('  Mon 6:30am  — habit seeder')
  console.log('  Mon–Fri 6:55am — morning brief')
  console.log('  Mon 7:00am  — gap review')
  console.log('  Hourly (weekdays) — email → tasks')
  console.log('  Wed 8:00am  — contact decay')
  console.log('  Fri 4:00pm  — friday retro')
  console.log('  POST /voice-journal — voice journal webhook')
})
