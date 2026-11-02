const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LENGTH = 254

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_EMAIL_LENGTH &&
    EMAIL_PATTERN.test(value)
  )
}

export function maskEmail(value: string): string {
  const atIndex = value.indexOf('@')
  if (atIndex <= 0) {
    return value
  }

  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  return `${local.slice(0, 1)}***@${domain}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getEmailConfig(): {
  apiKey: string
  senderEmail: string
  senderName: string
} {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim()
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Beldex Wallet'

  if (!apiKey || !senderEmail) {
    throw new Error(
      'Email delivery is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.'
    )
  }

  return { apiKey, senderEmail, senderName }
}

export async function sendOtpEmail(
  receiverEmail: string,
  code: string,
  expiresAt: Date
): Promise<void> {
  const { apiKey, senderEmail, senderName } = getEmailConfig()
  const expiresInMinutes = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - Date.now()) / 60_000)
  )

  const textContent = [
    'Your Beldex Wallet verification code is:',
    '',
    code,
    '',
    `This code expires in ${expiresInMinutes} minute${expiresInMinutes === 1 ? '' : 's'}.`,
    'If you did not request this code, you can ignore this email.'
  ].join('\n')

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Your Beldex Wallet verification code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">
        ${escapeHtml(code)}
      </p>
      <p>This code expires in ${expiresInMinutes} minute${expiresInMinutes === 1 ? '' : 's'}.</p>
      <p style="color: #6b7280;">If you did not request this code, you can ignore this email.</p>
    </div>
  `.trim()

  let response: Response

  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [{ email: receiverEmail }],
        subject: 'Your Beldex Wallet verification code',
        textContent,
        htmlContent
      })
    })
  } catch {
    throw new Error('Could not reach the email provider')
  }

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}`)
  }
}
