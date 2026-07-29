import * as notion from '../clients/notion'
import * as claude from '../clients/claude'
import type { CreateTaskInput } from '../types'

export async function runGapReview(): Promise<void> {
  console.log('[gapReview] starting')

  const [tasks, goalsContent] = await Promise.all([
    notion.getAllActiveTasks(),
    notion.getGoalsContent(),
  ])

  console.log(`[gapReview] ${tasks.length} active tasks`)
  const analysis = await claude.analyzeGoalGaps(tasks, goalsContent)

  // create gap tasks
  for (const gap of analysis.gapTasks) {
    const notes = [
      `🎯 Goal: ${gap.goalAlignment}`,
      `🧠 ${gap.reasoning}`,
      `📅 Added by weekly gap review ${new Date().toISOString().slice(0, 10)}`,
    ].join('\n')

    const task: CreateTaskInput = {
      title:        gap.taskTitle,
      priority:     gap.priority,
      dueDate:      gap.dueDate,
      week:         gap.weekBucket,
      area:         gap.area,
      timeEstimate: gap.timeEstimate ?? undefined,
      source:       'Goal',
      status:       'Not Started',
      notes,
    }
    await notion.createTask(task)
    console.log(`[gapReview] gap task created: "${gap.taskTitle}"`)
  }

  // flag stale tasks — find by title and update notes
  for (const stale of analysis.staleTasks) {
    // find matching task by title
    const match = tasks.find(t =>
      t.title.toLowerCase().includes(stale.taskTitle.toLowerCase().slice(0, 30))
    )
    if (match) {
      const flagText = `⚠️ STALE as of ${new Date().toISOString().slice(0, 10)}: ${stale.staleReason}`
      await notion.updateTaskNotes(match.pageId, flagText)
      console.log(`[gapReview] flagged stale: "${match.title}"`)
    }
  }

  console.log(`[gapReview] done — ${analysis.gapTasks.length} gaps, ${analysis.staleTasks.length} stale`)
}

if (require.main === module) runGapReview().catch(console.error)
