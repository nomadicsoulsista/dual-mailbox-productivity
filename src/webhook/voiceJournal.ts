import type { Request, Response } from 'express'
import multer from 'multer'
import * as whisper from '../clients/whisper'
import * as claude from '../clients/claude'
import * as notion from '../clients/notion'
import type { CreateTaskInput, CreateJournalInput, PromptType } from '../types'

export const upload = multer({ storage: multer.memoryStorage() })

export async function voiceJournalRoute(req: Request, res: Response): Promise<void> {
  // basic auth — accept secret via header or query param
  const secret = req.headers['x-webhook-secret'] ?? req.query.secret
  if (secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  // support raw text body (Tasker sends base64 with newlines), multipart, or JSON
  let body = req.body
  if (typeof body === 'string') {
    try {
      console.log('[voiceJournal] raw body prefix:', body.slice(0, 200))
      const cleaned = body.replace(/"audio"\s*:\s*"([^"]+)"/s, (_m: string, b64: string) =>
        `"audio":"${b64.replace(/[\r\n\s]/g, '')}"`
      )
      body = JSON.parse(cleaned)
    } catch (e) {
      console.log('[voiceJournal] parse error, raw body prefix:', body.slice(0, 500))
      res.status(400).json({ error: 'invalid JSON body' })
      return
    }
  }

  const isMultipart = !!req.file
  const fmt: string = body.format ?? 'mp4'
  const timestamp: string = body.timestamp
  const prompt_used: string = body.prompt_used
  const prompt_type: string = body.prompt_type

  if (!isMultipart && !body.audio) {
    res.status(400).json({ error: 'audio is required' })
    return
  }

  try {
    // 1. transcribe
    console.log('[voiceJournal] transcribing audio')
    const transcript = isMultipart
      ? await whisper.transcribeBuffer(req.file!.buffer, fmt)
      : await whisper.transcribe(body.audio, fmt)
    console.log(`[voiceJournal] transcript: ${transcript.slice(0, 100)}...`)

    // 2. extract insights
    const date = timestamp ?? new Date().toISOString().slice(0, 10)
    const promptUsed = prompt_used ?? 'Open reflection'
    const promptType: PromptType = (prompt_type ?? 'daily') as PromptType

    const insights = await claude.extractJournalInsights(transcript, promptUsed, promptType, date)

    // 3. write journal entry
    const journalEntry: CreateJournalInput = {
      date,
      mood:           insights.mood,
      themes:         insights.themes,
      goalsMentioned: insights.goalsMentioned,
      summary:        insights.summary,
      wins:           insights.wins,
      friction:       insights.friction,
      insights:       insights.insights,
      evolutionNote:  insights.evolutionNote,
      promptUsed,
      promptType,
      transcript,
    }
    await notion.createJournalEntry(journalEntry)
    console.log('[voiceJournal] journal entry created')

    // 4. create action tasks from entry
    for (const item of insights.actionItems) {
      const task: CreateTaskInput = {
        title:    item,
        priority: 'Medium',
        week:     'This Week',
        area:     'Work',
        source:   'Review',
        status:   'Not Started',
        notes:    `📔 From voice journal entry ${date}`,
      }
      await notion.createTask(task)
      console.log(`[voiceJournal] action task: "${item}"`)
    }

    res.json({
      ok: true,
      summary: insights.summary,
      mood: insights.mood,
      actionItemsCreated: insights.actionItems.length,
    })

  } catch (err) {
    console.error('[voiceJournal] error:', err)
    res.status(500).json({ error: 'processing failed' })
  }
}
