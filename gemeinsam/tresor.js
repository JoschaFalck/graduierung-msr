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
 * Ein „Tresor" hält Salz und den daraus abgeleiteten Schlüssel für eine
 * geöffnete Klassendatei.
 *
 * Warum das nötig ist: Die Ableitung kostet 250.000 PBKDF2-Runden, also einige
 * hundert Millisekunden. Gespeichert wird aber nach jeder Änderung -- bei einem
 * Klassendurchgang dutzende Male. Zöge jeder Speichervorgang ein neues Salz,
 * müsste jedes Mal neu abgeleitet werden.
 *
 * Warum das unbedenklich ist: Das Salz schützt gegen vorberechnete Tabellen
 * über verschiedene Passwörter und Dateien hinweg -- dafür genügt ein Zufallswert
 * je Datei. Frisch sein muss bei AES-GCM der **IV**, und der wird weiterhin bei
 * jeder Verschlüsselung neu gezogen.
 *
 * Der Schlüssel ist nicht auslesbar (`extractable: false`). Dadurch muss die
 * Passphrase nach dem Öffnen nirgends mehr im Klartext gehalten werden.
 */
export async function tresorAnlegen(passphrase) {
  const salz = crypto.getRandomValues(new Uint8Array(SALZ_LAENGE));
  return { salz, schluessel: await schluessel(passphrase, salz) };
}

/**
 * Verschlüsselt ein Objekt zu einem Uint8Array:
 * "GRADU1" | Formatversion | Salz(16) | IV(12) | Geheimtext
 */
export async function verschluesseln(objekt, tresor) {
  const { salz } = tresor;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LAENGE));
  const geheim = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      tresor.schluessel,
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
 * Öffnet eine Datei und gibt `{ tresor, inhalt }` zurück. Das Salz der Datei
 * wird dabei übernommen, damit spätere Speichervorgänge nicht neu ableiten
 * müssen. Wirft mit sprechender Meldung, wenn die Datei nicht passt oder die
 * Passphrase falsch ist -- die Oberfläche zeigt das direkt an.
 */
export async function tresorOeffnen(bytes, passphrase) {
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

  const abgeleitet = await schluessel(passphrase, salz);

  let klar;
  try {
    klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, abgeleitet, geheim);
  } catch {
    throw new Error('Passwort falsch.');
  }
  return {
    tresor: { salz, schluessel: abgeleitet },
    inhalt: JSON.parse(new TextDecoder().decode(klar)),
  };
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
