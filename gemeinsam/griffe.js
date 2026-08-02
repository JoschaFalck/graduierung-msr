// Merkt sich Dateigriffe zwischen zwei Sitzungen.
//
// Ein FileSystemFileHandle oder -DirectoryHandle lässt sich nicht als Text
// ablegen, wohl aber strukturiert klonen -- und damit in IndexedDB legen.
// localStorage kann das nicht, deshalb hier eine eigene kleine Ablage.
//
// Was dabei NICHT gespeichert wird: der Inhalt der Datei. Ein Griff ist ein
// Verweis samt Berechtigung, keine Kopie. Die Klassendaten bleiben, wo sie
// sind -- verschlüsselt auf der Festplatte.
//
// Alle Funktionen scheitern leise: In privaten Fenstern oder bei gesperrtem
// Speicher gibt es kein IndexedDB, und die Anwendung muss trotzdem laufen.
// Sie fragt dann eben wieder nach der Datei.

const DATENBANK = 'graduierung';
const LAGER = 'griffe';

function datenbankOeffnen() {
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = indexedDB.open(DATENBANK, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(LAGER);
    anfrage.onsuccess = () => erfuellen(anfrage.result);
    anfrage.onerror = () => ablehnen(anfrage.error);
  });
}

async function imLager(modus, arbeit) {
  if (!('indexedDB' in globalThis)) return null;
  const datenbank = await datenbankOeffnen();
  try {
    return await new Promise((erfuellen, ablehnen) => {
      const vorgang = datenbank.transaction(LAGER, modus);
      const anfrage = arbeit(vorgang.objectStore(LAGER));
      anfrage.onsuccess = () => erfuellen(anfrage.result);
      anfrage.onerror = () => ablehnen(anfrage.error);
    });
  } finally {
    datenbank.close();
  }
}

export async function griffMerken(schluessel, griff) {
  try {
    await imLager('readwrite', (lager) => lager.put(griff, schluessel));
    return true;
  } catch {
    return false;
  }
}

export async function griffHolen(schluessel) {
  try {
    return (await imLager('readonly', (lager) => lager.get(schluessel))) ?? null;
  } catch {
    return null;
  }
}

export async function griffVergessen(schluessel) {
  try {
    await imLager('readwrite', (lager) => lager.delete(schluessel));
    return true;
  } catch {
    return false;
  }
}

/**
 * Fragt die Berechtigung für einen gemerkten Griff ab und bittet nötigenfalls
 * darum. Der Browser vergisst die Zusage zwischen Sitzungen, deshalb muss der
 * Aufruf **aus einer echten Nutzergeste heraus** erfolgen -- sonst lehnt er
 * die Nachfrage ohne Rückfrage ab.
 */
export async function griffErlauben(griff, modus = 'readwrite') {
  if (!griff?.queryPermission) return true; // ältere Browser kennen das nicht
  if ((await griff.queryPermission({ mode: modus })) === 'granted') return true;
  return (await griff.requestPermission({ mode: modus })) === 'granted';
}
