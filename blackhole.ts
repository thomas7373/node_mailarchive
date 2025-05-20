import Imap from 'imap';
import fs from 'fs';
import readline from 'readline';
import { execSync } from 'child_process';
import { config } from './config';

function flattenBoxes(boxes: Imap.MailBoxes, prefix = ''): string[] {
  const result: string[] = [];

  for (const [name, box] of Object.entries(boxes)) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    if (
      !fullName.includes('Archive.') &&
      !fullName.match(/INBOX\.(Sent|Sent Items|Kimenő|Elküldött elemek|Trash)/)
    ) {
      result.push(fullName);
    }

    if (box.children) {
      result.push(...flattenBoxes(box.children, fullName));
    }
  }

  return result;
}

function openBox(imap: Imap, boxName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, false, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getAllUserMailboxes(imap: Imap): Promise<string[]> {
  return new Promise((resolve, reject) => {
    imap.getBoxes('INBOX', (err, boxes) => {
      if (err || !boxes) return reject(err);
      const allFolders = flattenBoxes(boxes);
      resolve(allFolders);
    });
  });
}

function searchMessages(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search([['SINCE', '1-Jan-2023'], ['BEFORE', '1-Jan-2024']], (err: Error | null, results: number[] = []) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

function processUser(username: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: `${username}*${config.MASTER_USER}`,
      password: config.MASTER_PASS,
      host: config.IMAP_HOST,
      port: config.IMAP_PORT,
      tls: true,
    });

    imap.once('ready', async () => {
      try {
//        await createBox(imap, 'INBOX.Archive.Bejövő');
//        await createBox(imap, 'INBOX.Archive.Kimenő');
//        imap.subscribeBox('INBOX.Archive.Bejövő', (err) => {
//          if (err) console.warn(`⚠️  Nem sikerült feliratkozni: INBOX.Archive.Bejövő - ${err.message}`);
//        });
//        imap.subscribeBox('INBOX.Archive.Kimenő', (err) => {
//          if (err) console.warn(`⚠️  Nem sikerült feliratkozni: INBOX.Archive.Kimenő - ${err.message}`);
//        });

        await openBox(imap, 'INBOX');
        const messages = await searchMessages(imap);
        console.log(`📦 ${username}: ${messages.length} db 2023-as levél található az INBOX-ban.`);
        if (messages.length > 0) {
          const BATCH_SIZE = 100;
          for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const chunk = messages.slice(i, i + BATCH_SIZE);
            await new Promise<void>((resolve, reject) => {
              imap.addFlags(chunk, '\\Deleted', (err) => {
                if (err) {
                  console.error(`❌ Nem sikerült törölni az üzeneteket (${chunk.length}): ${err.message}`);
                  reject(err);
                } else {
                  imap.expunge((err) => {
                    if (err) {
                      console.error(`❌ Nem sikerült expunge művelet: ${err.message}`);
                      reject(err);
                    } else {
                      console.log(`🗑️  ${username}: ${chunk.length} levél törölve`);
                      resolve();
                    }
                  });
                }
              });
            });
          }
        }
        const sentFolders = [
          'INBOX.Sent',
          'INBOX.Sent Items',
          'INBOX.Kimenő',
        ];
        let sentMoved = false;

        for (const folder of sentFolders) {
          try {
            await openBox(imap, folder);
            const sentMessages = await searchMessages(imap);
            if (sentMessages.length > 0) {
              const BATCH_SIZE = 100;
              for (let i = 0; i < sentMessages.length; i += BATCH_SIZE) {
                const chunk = sentMessages.slice(i, i + BATCH_SIZE);
                await new Promise<void>((resolve, reject) => {

              imap.addFlags(chunk, '\\Deleted', (err) => {
                if (err) {
                  console.error(`❌ Nem sikerült törölni az üzeneteket (${chunk.length}): ${err.message}`);
                  reject(err);
                } else {
                  imap.expunge((err) => {
                    if (err) {
                      console.error(`❌ Nem sikerült expunge művelet: ${err.message}`);
                      reject(err);
                    } else {
                      console.log(`🗑️  ${username}: ${chunk.length} levél törölve`);
                      resolve();
                    }
                  });
                }
              });
            });
              }
              sentMoved = true;
              break;
            }
          } catch (err) {
            // console.warn(`⚠️  Nem sikerült megnyitni: ${folder} (${(err as Error).message})`);
            continue;
          }
        }

        if (!sentMoved) {
          console.log(`ℹ️  Nem találtunk archiválható levelet kimenő mappákban (${username})`);
        }
        const otherFolders = await getAllUserMailboxes(imap);
        for (const folder of otherFolders) {
          try {
            await openBox(imap, folder);
            const messages = await searchMessages(imap);
            if (messages.length > 0) {
              const BATCH_SIZE = 100;
              for (let i = 0; i < messages.length; i += BATCH_SIZE) {
                const chunk = messages.slice(i, i + BATCH_SIZE);
                await new Promise<void>((resolve, reject) => {
                  imap.addFlags(chunk, '\\Deleted', (err) => {
                    if (err) {
                      console.error(`❌ Nem sikerült törölni az üzeneteket (${chunk.length}): ${err.message}`);
                      reject(err);
                    } else {
                      imap.expunge((err) => {
                        if (err) {
                          console.error(`❌ Nem sikerült expunge művelet: ${err.message}`);
                          reject(err);
                        } else {
                          console.log(`🗑️  ${username}: ${chunk.length} levél törölve`);
                          resolve();
                        }
                      });
                    }
                  });
                });
              }
            }
          } catch (err) {
            // console.warn(`⚠️  Nem sikerült feldolgozni: ${folder} (${(err as Error).message})`);
          }
        }
      } catch (err: unknown) {
        console.error(`⚠️  Hiba ${username} feldolgozásakor:`, err);
      } finally {

        // await sendCompletionNotice(imap, username);
        imap.end();
        resolve();
      }
    });

    imap.once('error', (err: Error) => {
      console.error(`❌ Hiba ${username} fióknál:`, err);
      reject(err);
    });

    imap.connect();
  });
}

async function processAllUsers() {
  const rl = readline.createInterface({
    input: fs.createReadStream(config.USER_LIST_FILE),
    crlfDelay: Infinity,
  });
 
  const users: string[] = [];
  for await (const line of rl) {
    const username = line.trim();
    if (username) {
      users.push(username);
    }
  }
 
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const BATCH_SIZE = config.BATCH_SIZE;
  const DELAY_MS = config.DELAY_MS;
  const WORK_HOUR_START = config.WORK_HOUR_START;
  const WORK_HOUR_END = config.WORK_HOUR_END;
 
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const now = new Date();
    const hour = now.getHours();
 
    if (hour < WORK_HOUR_START || hour >= WORK_HOUR_END) {
      const msUntil9am =
        ((24 + WORK_HOUR_START - hour) % 24) * 60 * 60 * 1000 -
        now.getMinutes() * 60 * 1000 -
        now.getSeconds() * 1000 -
        now.getMilliseconds();
      console.log(`⏳ Munkaidőn kívül vagyunk, várunk ${Math.ceil(msUntil9am / 60000)} percet a folytatásig...`);
      await delay(msUntil9am);
    }
 
    const batch = users.slice(i, i + BATCH_SIZE);
    console.log(`🚀 Feldolgozás indul (${i + 1}–${i + batch.length})`);
 
    for (const user of batch) {
      try {
        await processUser(user);
      } catch (e: unknown) {
        // már kiírtuk a hibát a processUser-ben
      }
    }
 
    if (i + BATCH_SIZE < users.length) {
      console.log(`⏸️ Várakozás 2 órát a következő batch előtt...`);
      await delay(DELAY_MS);
    }
  }
 
  console.log('📋 Feldolgozás kész');
}


processAllUsers();
