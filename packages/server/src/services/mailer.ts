import nodemailer, { type Transporter } from 'nodemailer';

export interface DevMail {
  to: string;
  code: string;
  companyAd: string;
  at: string;
}

let transporter: Transporter | null = null;
const devOutbox: DevMail[] = [];

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

/** Testlerin kodu okuyabilmesi için yalnızca SMTP yokken doldurulan kutu. */
export function getDevOutbox(): DevMail[] {
  return devOutbox;
}

export function clearDevOutbox() {
  devOutbox.length = 0;
}

/**
 * 6 haneli doğrulama kodunu e-postayla gönderir. SMTP tanımlı değilse
 * (yerel geliştirme) kod konsola yazılır ve gönderim atlanır.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  companyAd: string
): Promise<{ sent: boolean; devMode: boolean }> {
  if (!isMailConfigured()) {
    console.log(`[DEV-MAIL] ${to} için doğrulama kodu: ${code}`);
    devOutbox.push({ to, code, companyAd, at: new Date().toISOString() });
    return { sent: false, devMode: true };
  }

  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER!;
  await getTransporter().sendMail({
    from: `"Oto Servis Paneli" <${fromAddr}>`,
    to,
    subject: `${companyAd} kaydınız için doğrulama kodunuz`,
    text: `Merhaba,\n\n${companyAd} firma kaydınızı tamamlamak için doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu işlemi siz yapmadıysanız bu e-postayı yok sayın.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="margin:0 0 8px">E-posta Doğrulama</h2>
      <p><b>${companyAd}</b> firma kaydınızı tamamlamak için aşağıdaki kodu girin:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">${code}</div>
      <p style="color:#6b7280;font-size:13px">Kod 10 dakika geçerlidir. Bu işlemi siz yapmadıysanız bu e-postayı yok sayın.</p>
    </div>`
  });
  return { sent: true, devMode: false };
}
