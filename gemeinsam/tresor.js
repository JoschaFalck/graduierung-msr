// Verschlüsselung der Klassendatei (AES-GCM, Schlüssel aus einer Passphrase).
//
// Warum ohne Ausnahme verschlüsselt: Auf einem Mac synchronisiert iCloud
// häufig Schreibtisch und Dokumente. Eine Klartextdatei würde dort unbemerkt
// landen -- also genau in der Cloud, die diese Architektur vermeidet.
// Verschlüsselt ist der Ablageort gleichgültig.

const KENNUNG = new TextEncoder().encode('GRADU1'); // 6 Byte
const FORMAT = 1;
const SALZ_LAENGE = 16;
const IV_LAENGE = 12;
const RUNDEN = 250_000;

/** Leitet den Schlüssel aus der Passphrase ab (PBKDF2, SHA-256). */
async function schluessel(passphrase, salz) {
  const roh = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salz, iterations: RUNDEN, hash: 'SHA-256' },
    roh,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Verschlüsselt ein Objekt zu einem Uint8Array:
 * "GRADU1" | Formatversion | Salz(16) | IV(12) | Geheimtext
 */
export async function verschluesseln(objekt, passphrase) {
  const salz = crypto.getRandomValues(new Uint8Array(SALZ_LAENGE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LAENGE));
  const geheim = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await schluessel(passphrase, salz),
      new TextEncoder().encode(JSON.stringify(objekt))
    )
  );

  const kopf = KENNUNG.length + 1 + SALZ_LAENGE + IV_LAENGE;
  const alles = new Uint8Array(kopf + geheim.length);
  alles.set(KENNUNG, 0);
  alles[KENNUNG.length] = FORMAT;
  alles.set(salz, KENNUNG.length + 1);
  alles.set(iv, KENNUNG.length + 1 + SALZ_LAENGE);
  alles.set(geheim, kopf);
  return alles;
}

/**
 * Entschlüsselt. Wirft mit sprechender Meldung, wenn die Datei nicht passt
 * oder die Passphrase falsch ist -- die Oberfläche zeigt das direkt an.
 */
export async function entschluesseln(bytes, passphrase) {
  const daten = new Uint8Array(bytes);

  if (daten.length < KENNUNG.length + 1 + SALZ_LAENGE + IV_LAENGE + 16) {
    throw new Error('Die Datei ist beschädigt oder keine Klassendatei.');
  }
  for (let i = 0; i < KENNUNG.length; i++) {
    if (daten[i] !== KENNUNG[i]) throw new Error('Das ist keine Klassendatei.');
  }
  if (daten[KENNUNG.length] > FORMAT) {
    throw new Error('Die Datei stammt aus einer neueren Fassung der Anwendung.');
  }

  const ab = KENNUNG.length + 1;
  const salz = daten.slice(ab, ab + SALZ_LAENGE);
  const iv = daten.slice(ab + SALZ_LAENGE, ab + SALZ_LAENGE + IV_LAENGE);
  const geheim = daten.slice(ab + SALZ_LAENGE + IV_LAENGE);

  let klar;
  try {
    klar = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await schluessel(passphrase, salz),
      geheim
    );
  } catch {
    throw new Error('Passwort falsch.');
  }
  return JSON.parse(new TextDecoder().decode(klar));
}

/** Grobe Einschätzung der Passphrase -- nur als Hinweis beim Anlegen. */
export function passphraseGuete(passphrase) {
  const p = passphrase ?? '';
  if (p.length < 8) return { stufe: 'schwach', text: 'Zu kurz – mindestens 8 Zeichen.' };
  const vielfalt = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 20 || (p.length >= 12 && vielfalt >= 3)) {
    return { stufe: 'gut', text: 'Gut.' };
  }
  return { stufe: 'mittel', text: 'Geht – länger oder gemischter wäre sicherer.' };
}
