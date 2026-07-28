import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASIS = new URL('gemeinsam', import.meta.url).pathname;

const {
  katalogSetzen, kriterienDerStufe, bewertungszeilen,
  rueckstufungsgruende, nachbarStufe, stufenBisEinschliesslich,
} = await import(`${BASIS}/katalog.js`);
const { uebergabeErzeugen, uebergabePruefen, dateiname } = await import(`${BASIS}/uebergabe.js`);

const katalog = katalogSetzen(JSON.parse(readFileSync(`${BASIS}/katalog.json`, 'utf8')));

let geprueft = 0;
const test = (name, fn) => { fn(); geprueft++; console.log('  ok  ' + name); };

console.log('\nKatalog');
test('14 Kriterien, 4 Stufen, 3 Skalenwerte', () => {
  assert.equal(katalog.kriterien.length, 14);
  assert.equal(katalog.stufen.length, 4);
  assert.equal(katalog.skala.length, 3);
});
test('IDs sind eindeutig', () => {
  const ids = katalog.kriterien.map(k => k.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('jedes Kriterium ist genau einer Stufe zugeordnet', () => {
  const zugeordnet = katalog.stufen.flatMap(s => s.eigeneKriterien);
  assert.equal(new Set(zugeordnet).size, 14);
  for (const k of katalog.kriterien) {
    const stufe = katalog.stufen.find(s => s.eigeneKriterien.includes(k.id));
    assert.equal(stufe.id, k.stufe, `${k.id}: stufe-Feld und Zuordnung weichen ab`);
  }
});
test('jedes Kriterium hat Text und Rückstufungstext', () => {
  for (const k of katalog.kriterien) {
    assert.ok(k.text?.startsWith('Ich '), `${k.id}: Text nicht in Ich-Form`);
    assert.ok(k.rueckstufung?.length > 10, `${k.id}: Rückstufungstext fehlt`);
  }
});

console.log('\nVererbung');
test('kumulative Kriterienzahl 7 / 9 / 12 / 14', () => {
  assert.equal(kriterienDerStufe(katalog, 'hafen').length, 7);
  assert.equal(kriterienDerStufe(katalog, 'ankerplatz').length, 9);
  assert.equal(kriterienDerStufe(katalog, 'boie').length, 12);
  assert.equal(kriterienDerStufe(katalog, 'freie-see').length, 14);
});
test('Reihenfolge ist aufsteigend nach Stufe', () => {
  const ids = kriterienDerStufe(katalog, 'freie-see').map(k => k.id);
  assert.deepEqual(ids.slice(0, 7), ['H1','H2','H3','H4','H5','H6','H7']);
  assert.deepEqual(ids.slice(-2), ['F1','F2']);
});
test('Sammelzeilen reduzieren auf 7 / 3 / 5 / 5 Zeilen', () => {
  assert.equal(bewertungszeilen(katalog, 'hafen').length, 7);
  assert.equal(bewertungszeilen(katalog, 'ankerplatz').length, 3);
  assert.equal(bewertungszeilen(katalog, 'boie').length, 5);
  assert.equal(bewertungszeilen(katalog, 'freie-see').length, 5);
});
test('Sammelzeilen decken alle geerbten Kriterien ab', () => {
  for (const stufe of katalog.stufen) {
    const abgedeckt = bewertungszeilen(katalog, stufe.id).flatMap(z => z.enthaelt.map(k => k.id));
    const erwartet = kriterienDerStufe(katalog, stufe.id).map(k => k.id);
    assert.deepEqual(abgedeckt.sort(), erwartet.sort(), `Lücke bei ${stufe.id}`);
  }
});
test('Sammelzeilentext lautet richtig', () => {
  const zeilen = bewertungszeilen(katalog, 'freie-see');
  assert.equal(zeilen[0].text, 'Ich erfülle die Verantwortlichkeiten im Hafen.');
  assert.equal(zeilen[1].text, 'Ich erfülle die Verantwortlichkeiten am Ankerplatz.');
  assert.equal(zeilen[2].text, 'Ich erfülle die Verantwortlichkeiten an der Boie.');
});
test('Nachbarstufen stimmen, Enden sind null', () => {
  assert.equal(nachbarStufe(katalog, 'hafen', 'hoch').id, 'ankerplatz');
  assert.equal(nachbarStufe(katalog, 'boie', 'runter').id, 'ankerplatz');
  assert.equal(nachbarStufe(katalog, 'hafen', 'runter'), null);
  assert.equal(nachbarStufe(katalog, 'freie-see', 'hoch'), null);
});
test('stufenBisEinschliesslich liefert aufsteigend', () => {
  assert.deepEqual(stufenBisEinschliesslich(katalog, 'boie').map(s => s.id),
    ['hafen', 'ankerplatz', 'boie']);
});

console.log('\nRückstufungsbogen (gegen die Original-PDFs)');
test('Rückstufung an den Hafen deckt die 10 Gründe von S. 5 ab', () => {
  const gruende = rueckstufungsgruende(katalog, 'ankerplatz').map(g => g.text).join(' ');
  for (const stichwort of ['Klassenregeln', 'Termine', 'beschädigt', 'beschriftet',
      'Ordnung am Arbeitsplatz', 'unaufmerksam', 'iPad', 'respektlos', 'Ziele',
      'Klassengemeinschaft']) {
    assert.ok(gruende.includes(stichwort), `fehlt: ${stichwort}`);
  }
});
test('Rückstufung an den Ankerplatz ergänzt die Boie-Gründe von S. 6', () => {
  const gruende = rueckstufungsgruende(katalog, 'boie').map(g => g.text).join(' ');
  assert.ok(gruende.includes('nicht beim Lernen unterstützt'));
  assert.ok(gruende.includes('Erfahrungen zum eigenen Lernen'));
});
test('Rückstufung an die Boie ergänzt die Freie-See-Gründe von S. 7', () => {
  const gruende = rueckstufungsgruende(katalog, 'freie-see').map(g => g.text).join(' ');
  assert.ok(gruende.includes('Lernpate'));
  assert.ok(gruende.includes('über die eigene Klasse hinaus'));
});
test('Gründezahl wächst mit der Stufe: 7 / 9 / 12 / 14', () => {
  assert.deepEqual(
    katalog.stufen.map(s => rueckstufungsgruende(katalog, s.id).length),
    [7, 9, 12, 14]
  );
});

console.log('\nÜbergabedatei');
const bewertungen = Object.fromEntries(
  kriterienDerStufe(katalog, 'ankerplatz').map((k, i) =>
    [k.id, ['erreicht', 'teilweise', 'nicht'][i % 3]])
);
const uebergabe = uebergabeErzeugen({
  schueler: { name: '  Lea Müßig ', klasse: ' 8a ' },
  stufe: 'ankerplatz',
  bewertungen,
  beleg: { kriteriumId: 'A1', text: '  Ich habe mein Ziel ins Logbuch geschrieben. ' },
  katalogVersion: katalog.version,
});

test('gültige Übergabe wird angenommen', () => {
  const ergebnis = uebergabePruefen(uebergabe, katalog);
  assert.ok(ergebnis.ok, JSON.stringify(ergebnis.fehler));
});
test('Leerzeichen werden getrimmt', () => {
  assert.equal(uebergabe.schueler.name, 'Lea Müßig');
  assert.equal(uebergabe.schueler.klasse, '8a');
  assert.equal(uebergabe.beleg.text, 'Ich habe mein Ziel ins Logbuch geschrieben.');
});
test('Dateiname ist sortierbar und ohne Umlaute', () => {
  const name = dateiname(uebergabe);
  assert.match(name, /^\d{4}-\d{2}-\d{2}_8a_Lea-Muessig\.json$/, name);
});
test('Roundtrip durch JSON bleibt gültig', () => {
  const wieder = JSON.parse(JSON.stringify(uebergabe));
  assert.ok(uebergabePruefen(wieder, katalog).ok);
});

console.log('\nÜbergabe: fehlerhafte Dateien');
const kaputt = (aenderung, erwartet) => {
  const kopie = JSON.parse(JSON.stringify(uebergabe));
  aenderung(kopie);
  const ergebnis = uebergabePruefen(kopie, katalog);
  assert.equal(ergebnis.ok, false, 'hätte abgelehnt werden müssen');
  assert.ok(ergebnis.fehler.join(' ').includes(erwartet),
    `erwartet "${erwartet}", bekam: ${ergebnis.fehler.join(' | ')}`);
};

test('fremde Datei wird abgelehnt', () => kaputt(o => { o.typ = 'etwas.anderes'; }, 'keine Selbsteinschätzung'));
test('neueres Format wird abgelehnt', () => kaputt(o => { o.formatVersion = 99; }, 'neueren Version'));
test('fehlender Name wird erkannt', () => kaputt(o => { o.schueler.name = '  '; }, 'Name fehlt'));
test('fehlende Klasse wird erkannt', () => kaputt(o => { o.schueler.klasse = ''; }, 'Klasse fehlt'));
test('unbekannte Stufe wird erkannt', () => kaputt(o => { o.stufe = 'lagune'; }, 'Unbekannte Stufe'));
test('ungültiger Skalenwert wird erkannt', () => kaputt(o => { o.bewertungen.H1 = 'super'; }, 'Ungültiger Wert'));
test('unbekanntes Kriterium wird erkannt', () => kaputt(o => { o.bewertungen.Z9 = 'erreicht'; }, 'Unbekanntes Kriterium'));
test('fehlender Belegsatz wird erkannt', () => kaputt(o => { o.beleg.text = ' '; }, 'Belegsatz fehlt'));
test('kaputtes Datum wird erkannt', () => kaputt(o => { o.erstellt = 'gestern'; }, 'Datum'));
test('leere Bewertungen werden erkannt', () => kaputt(o => { o.bewertungen = {}; }, 'Keine Bewertungen'));
test('Nichtobjekt wird abgefangen', () => {
  assert.equal(uebergabePruefen(null, katalog).ok, false);
  assert.equal(uebergabePruefen('text', katalog).ok, false);
});

console.log(`\n${geprueft} Prüfungen bestanden.\n`);
