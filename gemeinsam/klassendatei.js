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

/** Legt mehrere Kinder auf einmal an (eine Zeile je Name). */
export function lernendeAusListe(datei, text, stufe) {
  const angelegt = [];
  for (const zeile of text.split('\n')) {
    const name = zeile.trim();
    if (!name || lernendeSuchen(datei, name)) continue;
    angelegt.push(lernendeAnlegen(datei, name, stufe));
  }
  return angelegt;
}

const normal = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Findet ein Kind über den Namen -- tolerant gegenüber Schreibweise. */
export function lernendeSuchen(datei, name) {
  return datei.lernende.find((l) => normal(l.name) === normal(name)) ?? null;
}

/**
 * Vorhandene Namen, die dem gesuchten ähneln -- fängt Tippfehler ab,
 * bevor daraus ein zweites Kind mit halbem Verlauf wird.
 */
export function aehnlicheNamen(datei, name, hoechstabstand = 3) {
  const gesucht = normal(name);
  return datei.lernende
    .map((l) => ({ kind: l, abstand: abstand(normal(l.name), gesucht) }))
    .filter((t) => t.abstand <= hoechstabstand)
    .sort((a, b) => a.abstand - b.abstand)
    .map((t) => t.kind);
}

/** Levenshtein-Abstand, zeilenweise -- reicht für Namenslängen völlig. */
function abstand(a, b) {
  if (a === b) return 0;
  let vorige = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const aktuelle = [i];
    for (let j = 1; j <= b.length; j++) {
      aktuelle[j] = Math.min(
        vorige[j] + 1,
        aktuelle[j - 1] + 1,
        vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    vorige = aktuelle;
  }
  return vorige[b.length];
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

/**
 * Legt aus einer Übergabe ein neues Kind an und übernimmt sie.
 * Die vom Kind gemeldete Stufe ist beim Erstanlegen die beste Auskunft, die es gibt.
 */
export function uebergabeAlsNeuesKind(datei, uebergabe) {
  lernendeAnlegen(datei, uebergabe.schueler.name, uebergabe.stufe);
  return selbsteinschaetzungUebernehmen(datei, uebergabe);
}

/** Ordnet eine Übergabe einem bereits vorhandenen Kind zu (Tippfehler im Namen). */
export function uebergabeZuordnen(datei, uebergabe, schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) throw new Error('Unbekannte Person.');
  return selbsteinschaetzungUebernehmen(datei, {
    ...uebergabe,
    schueler: { ...uebergabe.schueler, name: kind.name },
  });
}

/**
 * Wie viele der geforderten Zeilen sind erfasst? Die Zeilen-IDs kommen von
 * bewertungszeilen() aus katalog.js -- diese Datei kennt den Katalog nicht.
 * Ohne diese Zählung sähe eine halb ausgefüllte Fremdeinschätzung in der
 * Übersicht genauso aus wie eine vollständige.
 */
export function erfassungsstand(datei, schuelerId, zeitraum, quelle, zeilenIds) {
  const bewertungen = einschaetzung(datei, schuelerId, zeitraum, quelle)?.bewertungen ?? {};
  const erfasst = zeilenIds.filter((id) => bewertungen[id]).length;
  return { erfasst, gesamt: zeilenIds.length, vollstaendig: erfasst === zeilenIds.length };
}

/** Wer hat im laufenden Zeitraum noch nicht abgegeben? */
export function fehlendeSelbsteinschaetzungen(datei, zeitraum = zeitraumFuer(datei)) {
  return datei.lernende.filter((l) => !einschaetzung(datei, l.id, zeitraum, 'selbst'));
}

// ---------------------------------------------------------------- Coaching

/**
 * Hält ein Coaching-Gespräch fest und setzt die Stufe entsprechend.
 * `entscheidung`: 'hoch' | 'gleich' | 'runter'.
 */
export function coachingEintragen(datei, { schuelerId, zeitraum, entscheidung, begruendung,
  vereinbarungen, gruende = [], gueltigAb, ausweisUebergeben = false, datum }) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) throw new Error('Unbekannte Person.');

  const vonStufe = kind.stufe;
  const nachStufe =
    entscheidung === 'gleich' ? vonStufe : nachbarStufeId(datei, vonStufe, entscheidung);

  const eintrag = {
    id: kennung(),
    schuelerId,
    datum: datum ?? heute(),
    zeitraum,
    zeitraeume: zeitraeumeDesBlocks(datei, zeitraum),
    entscheidung,
    vonStufe,
    nachStufe,
    begruendung: begruendung?.trim() ?? '',
    vereinbarungen: vereinbarungen?.trim() ?? '',
    gruende,
    gueltigAb: gueltigAb ?? heute(),
    ausweisUebergeben,
  };

  datei.coachings.push(eintrag);
  if (nachStufe !== vonStufe) {
    kind.stufe = nachStufe;
    kind.seit = eintrag.gueltigAb;
  }
  beruehren(datei);
  return eintrag;
}

function nachbarStufeId(datei, stufenId, richtung) {
  // Reihenfolge steckt im Katalog; hier reicht die bekannte Kette
  const kette = ['hafen', 'ankerplatz', 'boie', 'freie-see'];
  const i = kette.indexOf(stufenId);
  const ziel = i + (richtung === 'hoch' ? 1 : -1);
  return kette[Math.min(kette.length - 1, Math.max(0, ziel))];
}

/**
 * Stufenverlauf eines Kindes über das Schuljahr -- aus den Coachings abgeleitet,
 * damit es keine zweite Wahrheit gibt.
 */
export function stufenverlauf(datei, schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) return [];

  const gespraeche = datei.coachings
    .filter((c) => c.schuelerId === schuelerId)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const start = gespraeche.length ? gespraeche[0].vonStufe : kind.stufe;
  const verlauf = [{ stufe: start, ab: null, anlass: 'Start' }];

  for (const g of gespraeche) {
    verlauf.push({
      stufe: g.nachStufe,
      ab: g.gueltigAb,
      anlass: g.entscheidung,
      coachingId: g.id,
    });
  }
  return verlauf;
}

export function coachingsVon(datei, schuelerId) {
  return datei.coachings
    .filter((c) => c.schuelerId === schuelerId)
    .sort((a, b) => b.datum.localeCompare(a.datum));
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
