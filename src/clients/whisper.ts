import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as dotenv from 'dotenv'
import { execSync } from 'child_process'

dotenv.config()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SUPPORTED = ['flac','m4a','mp3','mp4','mpeg','mpga','oga','ogg','wav','webm']

function convertToMp3(inputPath: string): string {
  const outputPath = inputPath.replace(/\.[^.]+$/, '.mp3')
  execSync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -b:a 64k "${outputPath}"`, { stdio: 'pipe' })
  return outputPath
}

async function sendToWhisper(filePath: string): Promise<string> {
  const res = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    language: 'en',
  })
  return res.text
}

export async function transcribeBuffer(buffer: Buffer, format: string = 'm4a'): Promise<string> {
  const tmp = path.join(os.tmpdir(), `journal-${Date.now()}.${format}`)
  fs.writeFileSync(tmp, buffer)
  let converted: string | null = null
  try {
    converted = convertToMp3(tmp)
    return await sendToWhisper(converted)
  } finally {
    fs.existsSync(tmp) && fs.unlinkSync(tmp)
    converted && fs.existsSync(converted) && fs.unlinkSync(converted)
  }
}

export async function transcribe(audioBase64: string, format: string = 'm4a'): Promise<string> {
  const safeFormat = SUPPORTED.includes(format) ? format : 'm4a'
  const tmp = path.join(os.tmpdir(), `journal-${Date.now()}.${safeFormat}`)
  fs.writeFileSync(tmp, Buffer.from(audioBase64, 'base64'))
  let converted: string | null = null
  try {
    converted = convertToMp3(tmp)
    return await sendToWhisper(converted)
  } finally {
    fs.existsSync(tmp) && fs.unlinkSync(tmp)
    converted && fs.existsSync(converted) && fs.unlinkSync(converted)
  }
}
