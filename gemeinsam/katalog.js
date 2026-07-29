// Kriterienkatalog laden und die Stufenvererbung auflösen.
// Wird von der Schüler- und der Lehrkraft-Anwendung genutzt.

let geladen = null;

/** Lädt katalog.json (einmalig, danach aus dem Cache). */
export async function katalogLaden(basisPfad = '../gemeinsam') {
  if (geladen) return geladen;
  const antwort = await fetch(`${basisPfad}/katalog.json`);
  if (!antwort.ok) throw new Error(`Katalog nicht ladbar (${antwort.status})`);
  geladen = pruefen(await antwort.json());
  return geladen;
}

/** Nimmt einen bereits eingelesenen Katalog entgegen (für Tests). */
export function katalogSetzen(objekt) {
  geladen = pruefen(objekt);
  return geladen;
}

function pruefen(katalog) {
  const ids = new Set(katalog.kriterien.map((k) => k.id));
  for (const stufe of katalog.stufen) {
    for (const id of stufe.eigeneKriterien) {
      if (!ids.has(id)) throw new Error(`Stufe ${stufe.id} verweist auf unbekanntes Kriterium ${id}`);
    }
  }
  for (const kriterium of katalog.kriterien) {
    if (!katalog.stufen.some((s) => s.id === kriterium.stufe)) {
      throw new Error(`Kriterium ${kriterium.id} verweist auf unbekannte Stufe ${kriterium.stufe}`);
    }
  }
  return katalog;
}

export function stufe(katalog, stufenId) {
  const gefunden = katalog.stufen.find((s) => s.id === stufenId);
  if (!gefunden) throw new Error(`Unbekannte Stufe: ${stufenId}`);
  return gefunden;
}

export function kriterium(katalog, kriteriumId) {
  const gefunden = katalog.kriterien.find((k) => k.id === kriteriumId);
  if (!gefunden) throw new Error(`Unbekanntes Kriterium: ${kriteriumId}`);
  return gefunden;
}

/** Alle Stufen bis einschließlich der angegebenen, aufsteigend. */
export function stufenBisEinschliesslich(katalog, stufenId) {
  const grenze = stufe(katalog, stufenId).reihenfolge;
  return katalog.stufen
    .filter((s) => s.reihenfolge <= grenze)
    .sort((a, b) => a.reihenfolge - b.reihenfolge);
}

/**
 * Alle Kriterien, die auf dieser Stufe gelten — inklusive der geerbten
 * aus den darunterliegenden Stufen. Aufsteigend sortiert.
 */
export function kriterienDerStufe(katalog, stufenId) {
  return stufenBisEinschliesslich(katalog, stufenId).flatMap((s) =>
    s.eigeneKriterien.map((id) => kriterium(katalog, id))
  );
}

/**
 * Bewertungszeilen für die Lehrkraft-Erfassung: geerbte Stufen werden zu
 * je einer Sammelzeile zusammengefasst, die eigenen Kriterien stehen einzeln.
 * So bleibt die Papierlogik erhalten (statt 14 Zeilen auf Freier See nur 5).
 */
export function bewertungszeilen(katalog, stufenId) {
  const stufen = stufenBisEinschliesslich(katalog, stufenId);
  const eigene = stufen[stufen.length - 1];

  const sammelzeilen = stufen.slice(0, -1).map((s) => ({
    art: 'sammel',
    id: `stufe:${s.id}`,
    text: `Ich erfülle die Verantwortlichkeiten ${praeposition(s.id)}.`,
    stufenId: s.id,
    enthaelt: s.eigeneKriterien.map((id) => kriterium(katalog, id)),
  }));

  const einzelzeilen = eigene.eigeneKriterien.map((id) => {
    const k = kriterium(katalog, id);
    return { art: 'einzel', id: k.id, text: k.text, stufenId: eigene.id, enthaelt: [k] };
  });

  return [...sammelzeilen, ...einzelzeilen];
}

/** „im Hafen“, „am Ankerplatz“, „an der Boie“, „auf Freier See“ */
export function praeposition(stufenId) {
  return {
    hafen: 'im Hafen',
    ankerplatz: 'am Ankerplatz',
    boie: 'an der Boie',
    'freie-see': 'auf Freier See',
  }[stufenId] ?? stufenId;
}

/** Die Stufe darüber bzw. darunter — null, wenn es keine gibt. */
export function nachbarStufe(katalog, stufenId, richtung) {
  const ziel = stufe(katalog, stufenId).reihenfolge + (richtung === 'hoch' ? 1 : -1);
  return katalog.stufen.find((s) => s.reihenfolge === ziel) ?? null;
}

/**
 * Fasst mehrere Kriterienwerte zu einem Zeilenwert zusammen.
 *
 * Das Kind kreuzt einzelne Kriterien an, die Lehrkraft die Sammelzeile
 * („Ich erfülle die Verantwortlichkeiten im Hafen"). Für den Coaching-Bogen
 * müssen beide nebeneinanderstehen -- dafür wird die Selbstsicht verdichtet.
 *
 * Regel: der schlechteste Einzelwert zählt. „Ich erfülle die
 * Verantwortlichkeiten im Hafen" ist nicht erfüllt, sobald eine davon fehlt.
 * Gibt null zurück, wenn zu keinem Kriterium etwas vorliegt.
 */
export function zeilenwert(katalog, bewertungen, kriteriumIds) {
  const rang = new Map(katalog.skala.map((s, i) => [s.id, i])); // 0 = bester
  let schlechtester = null;

  for (const id of kriteriumIds) {
    const wert = bewertungen?.[id];
    if (!wert || !rang.has(wert)) continue;
    if (schlechtester === null || rang.get(wert) > rang.get(schlechtester)) schlechtester = wert;
  }
  return schlechtester;
}

/** Alle Rückstufungsgründe für eine Stufe — erzeugt den Rückstufungsbogen. */
export function rueckstufungsgruende(katalog, vonStufenId) {
  return kriterienDerStufe(katalog, vonStufenId).map((k) => ({
    id: k.id,
    text: k.rueckstufung,
  }));
}
