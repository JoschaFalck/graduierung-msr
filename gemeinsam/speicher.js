// Wo die Klassendatei liegt und wie sie dorthin kommt.
//
// KONZEPT Abschnitt 7 verlangt diese Trennung: „Heute `DateiSpeicher`, später
// eventuell `SchulcloudSpeicher`. Damit bleibt der Schritt zu V4 (ByCS Drive)
// eine Implementierung statt eines Neubaus." Vorher sprachen `speichern()` und
// `dateiOeffnen()` direkt mit der File System Access API, und der Wechsel wäre
// ein Umbau quer durch die Anwendung gewesen.
//
// Was hier NICHT steht, weil es Sache der Anwendung ist:
//   - Verschlüsselung (tresor.js)
//   - Reihenfolge der Schreibvorgänge und Zählung offener Änderungen
//   - die Entscheidung, ob überhaupt automatisch gesichert wird
// Dieses Modul kennt nur Bytes, Namen und Orte.

import { griffMerken, griffHolen, griffVergessen, griffErlauben } from './griffe.js';

/**
 * Speicher auf der lokalen Festplatte.
 *
 * `ablage` ist der Schlüssel, unter dem sich der Speicher den zuletzt
 * benutzten Ort merkt -- damit zwei Anwendungen sich nicht ins Gehege kommen.
 */
export function dateiSpeicher({ ablage, ordnerAblage } = {}) {
  // Ein *Ort* ist alles, was dieser Speicher braucht, um wiederzufinden, wohin
  // geschrieben wird. Hier ist das ein FileSystemFileHandle -- in einer
  // Cloud-Fassung wäre es eine Kennung, und die Anwendung merkte den
  // Unterschied nicht.
  let ort = null;

  const direkt = 'showSaveFilePicker' in globalThis;
  const ordnerMoeglich = 'showDirectoryPicker' in globalThis;

  /** Echter Griff, oder nur der Rückfall aus `waehlenZumOeffnen()`? */
  const beschreibbar = (o) => typeof o?.createWritable === 'function';

  function merken() {
    if (ablage && beschreibbar(ort)) griffMerken(ablage, ort);
  }

  return {
    /** Schreibt dieser Speicher ohne Rückfrage in die Arbeitsdatei zurück? */
    get schreibtStillZurueck() {
      return beschreibbar(ort);
    },
    get name() {
      return ort?.name ?? null;
    },
    get kannOrdner() {
      return ordnerMoeglich;
    },

    /** Vergisst den Ort, ohne die Datei anzufassen. */
    schliessen() {
      ort = null;
    },

    /**
     * Fragt nach einer Datei zum Öffnen. Ohne File System Access API (Safari)
     * ein klassischer Dateidialog -- der liefert nur einen Stand, keinen Ort,
     * gespeichert wird dort später über einen Download.
     */
    async waehlenZumOeffnen() {
      if (direkt) {
        try {
          [ort] = await globalThis.showOpenFilePicker({
            types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
          });
        } catch {
          return null; // abgebrochen
        }
        merken();
        return { name: ort.name };
      }

      return new Promise((erfuellen) => {
        const eingabe = Object.assign(document.createElement('input'), {
          type: 'file',
          accept: '.gradu',
        });
        eingabe.addEventListener('change', () => {
          const gewaehlt = eingabe.files?.[0];
          if (!gewaehlt) return erfuellen(null);
          ort = { name: gewaehlt.name, _stand: gewaehlt };
          erfuellen({ name: ort.name });
        });
        eingabe.click();
      });
    },

    /** Der zuletzt benutzte Ort aus einer früheren Sitzung, sofern gemerkt. */
    async zuletztBenutzt() {
      if (!ablage) return null;
      const gemerkt = await griffHolen(ablage);
      return gemerkt?.name ? { name: gemerkt.name } : null;
    },

    /**
     * Übernimmt den gemerkten Ort. **Nur aus einer Nutzergeste heraus
     * aufrufen**: Der Browser beantwortet die Nachfrage nach der Berechtigung
     * sonst ohne Rückfrage mit Nein.
     */
    async zuletztUebernehmen() {
      const gemerkt = await griffHolen(ablage);
      if (!gemerkt || !(await griffErlauben(gemerkt))) return null;
      ort = gemerkt;
      return { name: ort.name };
    },

    async zuletztVergessen() {
      if (ablage) await griffVergessen(ablage);
    },

    /** Liest die Bytes des aktuellen Ortes. */
    async lesen() {
      if (!ort) throw new Error('Kein Ort gewählt.');
      const stand = ort._stand ?? (await ort.getFile());
      return stand.arrayBuffer();
    },

    /**
     * Schreibt Bytes an den aktuellen Ort. Gibt zurück, was passiert ist:
     * `datei` (direkt zurückgeschrieben), `download` (Rückfall) oder
     * `abgebrochen` (Speicherort-Dialog weggeklickt -- nichts geschrieben).
     */
    async schreiben(bytes, { name, neuerOrt = false } = {}) {
      if (direkt) {
        try {
          if (neuerOrt || !beschreibbar(ort)) {
            ort = await globalThis.showSaveFilePicker({
              suggestedName: name,
              types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
            });
            merken();
          }
          const strom = await ort.createWritable();
          await strom.write(bytes);
          await strom.close();
          return 'datei';
        } catch (fehler) {
          // Nur der Abbruch ist eindeutig. Bei allem anderen ist ein Download
          // besser als gar nichts -- die Daten sollen nicht verlorengehen.
          if (fehler.name === 'AbortError') return 'abgebrochen';
        }
      }
      herunterladen(bytes, name);
      return 'download';
    },

    /**
     * Legt eine Kopie an einem frei gewählten Ort ab, ohne den Arbeitsort zu
     * ändern -- die Arbeitsdatei bleibt, wo sie ist.
     */
    async kopieAblegen(bytes, name) {
      if (direkt) {
        try {
          const ziel = await globalThis.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
          });
          const strom = await ziel.createWritable();
          await strom.write(bytes);
          await strom.close();
          return 'datei';
        } catch (fehler) {
          if (fehler.name === 'AbortError') return 'abgebrochen';
        }
      }
      herunterladen(bytes, name);
      return 'download';
    },

    // ---------------------------------------------------------------- Ordner
    // Für die wöchentlichen Kopien. Ein Dateiort kennt sein Verzeichnis nicht,
    // deshalb wird der Ordner getrennt gewählt und gemerkt.

    async ordnerWaehlen() {
      if (!ordnerMoeglich) return null;
      try {
        const ordner = await globalThis.showDirectoryPicker({ mode: 'readwrite' });
        await griffMerken(ordnerAblage, ordner);
        return { name: ordner.name };
      } catch {
        return null;
      }
    },

    async ordnerName() {
      const ordner = await griffHolen(ordnerAblage);
      return ordner ? { name: ordner.name } : null;
    },

    async ordnerVergessen() {
      await griffVergessen(ordnerAblage);
    },

    /**
     * Legt eine Kopie im gemerkten Ordner ab und räumt ältere weg. `muster`
     * bestimmt, was als frühere Kopie derselben Sache gilt -- angefasst wird
     * ausschließlich, was darauf passt.
     */
    async inOrdnerAblegen(bytes, name, { muster, behalten }) {
      const ordner = await griffHolen(ordnerAblage);
      if (!ordner || !(await griffErlauben(ordner))) return null;

      const eintrag = await ordner.getFileHandle(name, { create: true });
      const strom = await eintrag.createWritable();
      await strom.write(bytes);
      await strom.close();

      if (muster && behalten) await aufraeumen(ordner, muster, behalten);
      return name;
    },

    /** Namen im Sicherungsordner -- nur, wenn der Zugriff ohnehin schon steht. */
    async ordnerInhalt() {
      const ordner = await griffHolen(ordnerAblage);
      if (!ordner) return null;
      const zugriff = await ordner.queryPermission?.({ mode: 'read' });
      if (zugriff && zugriff !== 'granted') return null;
      try {
        return await namenIm(ordner, /\.gradu$/);
      } catch {
        return null;
      }
    },
  };
}

async function namenIm(ordner, muster) {
  const namen = [];
  for await (const [dateiname, eintrag] of ordner.entries()) {
    if (eintrag.kind === 'file' && muster.test(dateiname)) namen.push(dateiname);
  }
  return namen.sort();
}

/**
 * Behält die neuesten Kopien und löscht ältere. Ohne das läuft der Ordner über
 * ein Schuljahr auf Dutzende Dateien zu, und keine davon ist erkennbar die
 * richtige. Sortiert wird nach Namen -- das geht nur auf, weil der Name auf
 * ein ISO-Datum endet.
 */
async function aufraeumen(ordner, muster, behalten) {
  const gefunden = await namenIm(ordner, muster);
  for (const alt of gefunden.slice(0, Math.max(0, gefunden.length - behalten))) {
    await ordner.removeEntry(alt).catch(() => {});
  }
}

function herunterladen(bytes, name) {
  const adresse = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const verweis = Object.assign(document.createElement('a'), { href: adresse, download: name });
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}
