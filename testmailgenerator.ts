// test-mail-generator.ts
import fs from 'fs';
import readline from 'readline';
import { config } from './config';
import Imap from 'imap';

async function sendTestMail(to: string, year: number) {
  const dateStr = getRandomDateString(year);
  const subject = `Teszt levél ${year}-ból`;
  const body = `Ez egy teszt üzenet a ${year}-as évből.`;
  const message = [
    `From: ${config.SMTP_USER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${dateStr}`,
    '',
    body,
  ].join('\r\n');

  const imap = new Imap({
    user: `${to}*${config.MASTER_USER}`,
    password: config.MASTER_PASS,
    host: config.IMAP_HOST,
    port: config.IMAP_PORT,
    tls: true,
  });

  await new Promise<void>((resolve, reject) => {
    imap.once('ready', () => {
      imap.append(message, { mailbox: 'INBOX', date: new Date(dateStr) }, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✉️  Teszt levél beszúrva IMAP-on: ${to} (${year})`);
          imap.end();
          resolve();
        }
      });
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
}

async function sendMailsToAllUsers(year: number) {
  const rl = readline.createInterface({
    input: fs.createReadStream(config.USER_LIST_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const user = line.trim();
    if (user) {
      try {
        await sendTestMail(user, year);
      } catch (err) {
        console.error(`⚠️  Hiba ${user} levélküldésekor:`, err);
      }
    }
  }
}

// Véletlenszerű dátum generálása a megadott évben
function getRandomDateString(year: number): string {
    const month = Math.floor(Math.random() * 12); // 0–11
    const day = Math.floor(Math.random() * 28) + 1; // 1–28
    const hour = Math.floor(Math.random() * 24);
    const minute = Math.floor(Math.random() * 60);
    const date = new Date(Date.UTC(year, month, day, hour, minute));
    return date.toUTCString();
}

sendMailsToAllUsers(2023).then(() => {
  console.log('✅ Minden tesztlevél elküldve');
});
