// Format der Übergabedatei Kind -> Lehrkraft.
// Bewusst unverschlüsselter Klartext: ein Schlüsselaustausch mit 25 Kindern wäre
// unpraktikabel. Dafür gilt die Regel aus KONZEPT.md Abschnitt 6 -- der
// Downloads-Ordner wird nach dem Import geleert.

export const TYP = 'graduierung.selbsteinschaetzung';
export const FORMAT_VERSION = 1;

/** Baut den Inhalt der Übergabedatei. */
export function uebergabeErzeugen({ schueler, stufe, bewertungen, beleg, katalogVersion }) {
  return {
    typ: TYP,
    formatVersion: FORMAT_VERSION,
    katalogVersion,
    erstellt: new Date().toISOString(),
    schueler: { name: schueler.name.trim(), klasse: schueler.klasse.trim() },
    stufe,
    bewertungen,
    beleg: { kriteriumId: beleg.kriteriumId, text: beleg.text.trim() },
  };
}

/**
 * Dateiname: nach Datum sortierbar, damit im Downloads-Ordner alles
 * einer Runde beieinanderliegt.
 */
export function dateiname(uebergabe) {
  const datum = uebergabe.erstellt.slice(0, 10);
  return `${datum}_${sauber(uebergabe.schueler.klasse)}_${sauber(uebergabe.schueler.name)}.json`;
}

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

function sauber(text) {
  return text
    .replace(/[äöüÄÖÜß]/g, (zeichen) => UMLAUTE[zeichen]) // deutsch, vor NFD
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // Rest: é -> e, ç -> c
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Prüft eine eingelesene Datei. Gibt { ok, uebergabe } oder { ok: false, fehler }
 * zurück -- die Lehrkraft-App soll bei einer kaputten Datei nicht abstürzen,
 * sondern sie in der Importliste als fehlerhaft anzeigen.
 */
export function uebergabePruefen(objekt, katalog) {
  const fehler = [];
  const f = (text) => fehler.push(text);

  if (!objekt || typeof objekt !== 'object') return ergebnis(['Keine gültige JSON-Datei.']);
  if (objekt.typ !== TYP) return ergebnis(['Das ist keine Selbsteinschätzung.']);
  if (objekt.formatVersion > FORMAT_VERSION) {
    return ergebnis([`Die Datei stammt aus einer neueren Version (${objekt.formatVersion}).`]);
  }

  if (!objekt.schueler?.name?.trim()) f('Name fehlt.');
  if (!objekt.schueler?.klasse?.trim()) f('Klasse fehlt.');
  if (!Number.isFinite(Date.parse(objekt.erstellt ?? ''))) f('Datum fehlt oder ist ungültig.');

  const stufe = katalog.stufen.find((s) => s.id === objekt.stufe);
  if (!stufe) f(`Unbekannte Stufe: ${objekt.stufe}`);

  const erlaubteWerte = new Set(katalog.skala.map((s) => s.id));
  const bewertungen = objekt.bewertungen ?? {};
  if (!Object.keys(bewertungen).length) f('Keine Bewertungen enthalten.');
  for (const [id, wert] of Object.entries(bewertungen)) {
    if (!katalog.kriterien.some((k) => k.id === id)) f(`Unbekanntes Kriterium: ${id}`);
    if (!erlaubteWerte.has(wert)) f(`Ungültiger Wert bei ${id}: ${wert}`);
  }

  if (!objekt.beleg?.text?.trim()) f('Der Belegsatz fehlt.');
  if (objekt.beleg?.kriteriumId && !katalog.kriterien.some((k) => k.id === objekt.beleg.kriteriumId)) {
    f(`Belegsatz verweist auf unbekanntes Kriterium: ${objekt.beleg.kriteriumId}`);
  }

  return ergebnis(fehler, objekt);
}

function ergebnis(fehler, uebergabe) {
  return fehler.length ? { ok: false, fehler } : { ok: true, uebergabe };
}
