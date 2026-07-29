/**
 * OAuth2 helper — generates refresh tokens for both Gmail accounts.
 * Uses a local HTTP server on port 3333 to capture the auth code.
 *
 * Before running:
 *   1. In Google Cloud Console → Credentials → your OAuth client
 *   2. Add  http://localhost:3333  to "Authorized redirect URIs"
 *   3. Save, then run: npx ts-node src/scripts/auth.ts
 */
import { google } from 'googleapis'
import * as http from 'http'
import * as url from 'url'
import * as dotenv from 'dotenv'
dotenv.config()

const REDIRECT = 'http://localhost:3333'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
]

function getToken(clientId: string, clientSecret: string, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT)
    const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' })

    console.log(`\n=== ${label} ===`)
    console.log(`Opening browser for ${label}...`)
    console.log(`If it doesn't open, paste this URL manually:\n${authUrl}\n`)

    // open browser
    const { execSync } = require('child_process')
    try { execSync(`open "${authUrl}"`) } catch {}

    // spin up local server to capture the redirect
    const server = http.createServer(async (req, res) => {
      const qs = url.parse(req.url ?? '', true).query
      const code = qs.code as string | undefined

      if (!code) {
        res.end('No code received.')
        return
      }

      res.end('<h2>✓ Authorized. You can close this tab and return to the terminal.</h2>')
      server.close()

      try {
        const { tokens } = await auth.getToken(code)
        if (!tokens.refresh_token) {
          reject(new Error(
            'No refresh token returned. Revoke access at https://myaccount.google.com/permissions and retry.'
          ))
          return
        }
        resolve(tokens.refresh_token)
      } catch (err) {
        reject(err)
      }
    })

    server.listen(3333, () => console.log('Waiting for browser authorization...'))
  })
}

async function main() {
  const clientId     = process.env.GMAIL_CLIENT_ID?.trim()     ?? ''
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? ''

  if (!clientId || !clientSecret) {
    console.error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env')
    process.exit(1)
  }

  const rt1 = await getToken(clientId, clientSecret, 'Account 1')
  console.log('\n✓ Account 1 authorized')

  const rt2 = await getToken(clientId, clientSecret, 'Account 2')
  console.log('\n✓ Account 2 authorized')

  console.log('\n=== Paste these into your .env ===')
  console.log(`GMAIL_ACCOUNT1_REFRESH_TOKEN=${rt1}`)
  console.log(`GMAIL_ACCOUNT2_REFRESH_TOKEN=${rt2}`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
