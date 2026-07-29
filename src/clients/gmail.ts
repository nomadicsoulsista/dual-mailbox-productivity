import { google, gmail_v1 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as dotenv from 'dotenv'
import type { GmailAccount, EmailMessage } from '../types'

dotenv.config()

function buildClient(account: GmailAccount): OAuth2Client {
  const auth = new google.auth.OAuth2(account.clientId, account.clientSecret)
  auth.setCredentials({ refresh_token: account.refreshToken })
  return auth
}

function headerVal(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    for (const part of payload.parts) {
      const nested = decodeBody(part)
      if (nested) return nested
    }
  }
  return ''
}

export function getAccounts(): GmailAccount[] {
  return [
    {
      label: 'account1',
      email: process.env.GMAIL_ACCOUNT1_EMAIL ?? '',
      clientId: process.env.GMAIL_CLIENT_ID ?? '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET ?? '',
      refreshToken: process.env.GMAIL_ACCOUNT1_REFRESH_TOKEN ?? '',
    },
    {
      label: 'account2',
      email: process.env.GMAIL_ACCOUNT2_EMAIL ?? '',
      clientId: process.env.GMAIL_CLIENT_ID ?? '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET ?? '',
      refreshToken: process.env.GMAIL_ACCOUNT2_REFRESH_TOKEN ?? '',
    },
  ]
}

export async function fetchUnread(account: GmailAccount, sinceMs?: number): Promise<EmailMessage[]> {
  const auth = buildClient(account)
  const gmail = google.gmail({ version: 'v1', auth })

  const after = sinceMs ?? Date.now() - 60 * 60 * 1000
  const afterSec = Math.floor(after / 1000)
  const q = `is:unread -label:productivity-processed -label:n8n-processed -label:newsletters after:${afterSec}`

  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 })
  const messages = list.data.messages ?? []
  if (!messages.length) return []

  const full = await Promise.all(
    messages.map(m => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' }))
  )

  return full.map(r => {
    const headers = r.data.payload?.headers ?? []
    return {
      id: r.data.id ?? '',
      threadId: r.data.threadId ?? '',
      subject: headerVal(headers, 'Subject'),
      from: headerVal(headers, 'From'),
      to: headerVal(headers, 'To'),
      date: headerVal(headers, 'Date'),
      snippet: r.data.snippet ?? '',
      body: r.data.payload ? decodeBody(r.data.payload) : '',
      accountLabel: account.label,
    }
  })
}

export async function applyLabel(account: GmailAccount, messageId: string, labelName: string): Promise<void> {
  const auth = buildClient(account)
  const gmail = google.gmail({ version: 'v1', auth })

  // get or create label
  const labelsRes = await gmail.users.labels.list({ userId: 'me' })
  let label = labelsRes.data.labels?.find(l => l.name === labelName)
  if (!label) {
    const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: labelName } })
    label = created.data
  }

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.id!] },
  })
}

export async function sendEmail(params: { to: string; subject: string; body: string }): Promise<void> {
  const accounts = getAccounts()
  const account = accounts[0]
  const auth = buildClient(account)
  const gmail = google.gmail({ version: 'v1', auth })

  const raw = Buffer.from(
    `To: ${params.to}\r\nSubject: ${params.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${params.body}`
  ).toString('base64url')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
