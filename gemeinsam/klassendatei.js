// Datenmodell der Klassendatei und die Operationen darauf.
// Reine Funktionen ohne DOM -- dadurch in Node prüfbar.

export const TYP = 'graduierung.klasse';
export const FORMAT_VERSION = 1;

export function klasseAnlegen({ klasse, schuljahr, zyklusStart, katalogVersion }) {
  return {
    typ: TYP,
    formatVersion: FORMAT_VERSION,
    katalogVersion,
    klasse: klasse.trim(),
    schuljahr: schuljahr.trim(),
    angelegt: new Date().toISOString(),
    geaendert: new Date().toISOString(),
    zyklus: { start: zyklusStart, tageJeZeitraum: 14, zeitraeumeJeCoaching: 4 },
    lernende: [],
    einschaetzungen: [],
    coachings: [],
  };
}

export function pruefen(objekt) {
  if (!objekt || typeof objekt !== 'object') throw new Error('Keine gültige Klassendatei.');
  if (objekt.typ !== TYP) throw new Error('Das ist keine Klassendatei.');
  if (objekt.formatVersion > FORMAT_VERSION) {
    throw new Error('Die Datei stammt aus einer neueren Fassung der Anwendung.');
  }
  for (const feld of ['lernende', 'einschaetzungen', 'coachings']) {
    if (!Array.isArray(objekt[feld])) objekt[feld] = [];
  }
  return objekt;
}

// ---------------------------------------------------------------- Lernende

export function lernendeAnlegen(datei, name, stufe) {
  const eintrag = {
    id: kennung(),
    name: name.trim(),
    stufe,
    seit: heute(),
  };
  datei.lernende.push(eintrag);
  datei.lernende.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  beruehren(datei);
  return eintrag;
}

/** Findet ein Kind über den Namen -- tolerant gegenüber Schreibweise. */
export function lernendeSuchen(datei, name) {
  const norm = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');
  return datei.lernende.find((l) => norm(l.name) === norm(name)) ?? null;
}

export function stufeSetzen(datei, schuelerId, stufe) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) throw new Error('Unbekannte Person.');
  kind.stufe = stufe;
  kind.seit = heute();
  beruehren(datei);
  return kind;
}

// ---------------------------------------------------------------- Zeiträume

/**
 * Nummer des Zeitraums, in den ein Datum fällt (1-basiert).
 * Ferien werden bewusst nicht herausgerechnet: Der Zyklus läuft weiter,
 * und ein übersprungener Zeitraum ist in der Übersicht schlicht leer.
 */
export function zeitraumFuer(datei, datum = new Date()) {
  const start = new Date(`${datei.zyklus.start}T00:00:00`);
  const tage = Math.floor((new Date(datum) - start) / 86_400_000);
  return Math.max(1, Math.floor(tage / datei.zyklus.tageJeZeitraum) + 1);
}

/** Zeiträume eines Coaching-Blocks, z. B. [5,6,7,8] für den zweiten Block. */
export function zeitraeumeDesBlocks(datei, zeitraum) {
  const je = datei.zyklus.zeitraeumeJeCoaching;
  const block = Math.floor((zeitraum - 1) / je);
  return Array.from({ length: je }, (_, i) => block * je + i + 1);
}

export function coachingFaellig(datei, zeitraum = zeitraumFuer(datei)) {
  return zeitraum % datei.zyklus.zeitraeumeJeCoaching === 0;
}

// ---------------------------------------------------------------- Einschätzungen

export function einschaetzung(datei, schuelerId, zeitraum, quelle) {
  return (
    datei.einschaetzungen.find(
      (e) => e.schuelerId === schuelerId && e.zeitraum === zeitraum && e.quelle === quelle
    ) ?? null
  );
}

export function einschaetzungSetzen(datei, { schuelerId, zeitraum, quelle, bewertungen, beleg, stufe }) {
  const vorhanden = einschaetzung(datei, schuelerId, zeitraum, quelle);
  const eintrag = vorhanden ?? { id: kennung(), schuelerId, zeitraum, quelle };

  eintrag.bewertungen = { ...(eintrag.bewertungen ?? {}), ...bewertungen };
  eintrag.erstellt = new Date().toISOString();
  if (beleg) eintrag.beleg = beleg;
  if (stufe) eintrag.stufe = stufe;

  if (!vorhanden) datei.einschaetzungen.push(eintrag);
  beruehren(datei);
  return eintrag;
}

/**
 * Nimmt eine per AirDrop empfangene Selbsteinschätzung auf.
 * Gibt zurück, was passiert ist -- die Importliste zeigt das dem Nutzer an.
 */
export function selbsteinschaetzungUebernehmen(datei, uebergabe) {
  const kind = lernendeSuchen(datei, uebergabe.schueler.name);
  if (!kind) {
    return { art: 'unbekannt', name: uebergabe.schueler.name, uebergabe };
  }

  const zeitraum = zeitraumFuer(datei, uebergabe.erstellt);
  const vorhanden = einschaetzung(datei, kind.id, zeitraum, 'selbst');

  einschaetzungSetzen(datei, {
    schuelerId: kind.id,
    zeitraum,
    quelle: 'selbst',
    bewertungen: uebergabe.bewertungen,
    beleg: uebergabe.beleg,
    stufe: uebergabe.stufe,
  });

  const stufeWeicht = uebergabe.stufe !== kind.stufe;
  return {
    art: vorhanden ? 'ersetzt' : 'neu',
    name: kind.name,
    schuelerId: kind.id,
    zeitraum,
    stufeWeicht,
    gemeldeteStufe: uebergabe.stufe,
    gefuehrteStufe: kind.stufe,
  };
}

/** Wer hat im laufenden Zeitraum noch nicht abgegeben? */
export function fehlendeSelbsteinschaetzungen(datei, zeitraum = zeitraumFuer(datei)) {
  return datei.lernende.filter((l) => !einschaetzung(datei, l.id, zeitraum, 'selbst'));
}

// ---------------------------------------------------------------- Hilfen

function kennung() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

function beruehren(datei) {
  datei.geaendert = new Date().toISOString();
}
