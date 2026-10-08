// Stub para email
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  console.log(`[EMAIL STUB] To: ${to}, Subject: ${subject}`)
  return true
}
