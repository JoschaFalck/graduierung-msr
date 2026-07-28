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


// ---------------------------------------------------------------- Klassendatei
const kd = await import(`${BASIS}/klassendatei.js`);
const tresor = await import(`${BASIS}/tresor.js`);

console.log('\nKlassendatei');
const datei = kd.klasseAnlegen({
  klasse: ' 8a ', schuljahr: '2026/27',
  zyklusStart: '2026-09-14', katalogVersion: katalog.version,
});

test('wird angelegt und getrimmt', () => {
  assert.equal(datei.klasse, '8a');
  assert.equal(datei.zyklus.tageJeZeitraum, 14);
  assert.deepEqual([datei.lernende, datei.einschaetzungen, datei.coachings], [[], [], []]);
});
test('prüft Typ und Version', () => {
  assert.throws(() => kd.pruefen({ typ: 'anderes' }), /keine Klassendatei/);
  assert.throws(() => kd.pruefen({ typ: 'graduierung.klasse', formatVersion: 99 }), /neueren Fassung/);
  assert.ok(kd.pruefen({ typ: 'graduierung.klasse', formatVersion: 1 }));
});

const lea = kd.lernendeAnlegen(datei, ' Lea Müßig ', 'ankerplatz');
kd.lernendeAnlegen(datei, 'Ali Demir', 'hafen');
test('Lernende werden alphabetisch geführt', () => {
  assert.deepEqual(datei.lernende.map(l => l.name), ['Ali Demir', 'Lea Müßig']);
});
test('Namenssuche ist tolerant', () => {
  assert.equal(kd.lernendeSuchen(datei, 'lea   müßig').id, lea.id);
  assert.equal(kd.lernendeSuchen(datei, 'Unbekannt'), null);
});

console.log('\nZeiträume');
test('Zeitraum wächst alle 14 Tage', () => {
  assert.equal(kd.zeitraumFuer(datei, '2026-09-14'), 1);
  assert.equal(kd.zeitraumFuer(datei, '2026-09-27'), 1);
  assert.equal(kd.zeitraumFuer(datei, '2026-09-28'), 2);
  assert.equal(kd.zeitraumFuer(datei, '2026-11-09'), 5);
});
test('vor dem Start bleibt es Zeitraum 1', () => {
  assert.equal(kd.zeitraumFuer(datei, '2026-08-01'), 1);
});
test('Coaching-Block umfasst vier Zeiträume', () => {
  assert.deepEqual(kd.zeitraeumeDesBlocks(datei, 3), [1, 2, 3, 4]);
  assert.deepEqual(kd.zeitraeumeDesBlocks(datei, 5), [5, 6, 7, 8]);
});
test('Coaching ist nach jedem vierten Zeitraum fällig', () => {
  assert.deepEqual([1,2,3,4,5,8].map(z => kd.coachingFaellig(datei, z)),
    [false, false, false, true, false, true]);
});

console.log('\nImport der Selbsteinschätzungen');
const machUebergabe = (name, stufe, wann) => ({
  ...uebergabeErzeugen({
    schueler: { name, klasse: '8a' }, stufe,
    bewertungen: Object.fromEntries(kriterienDerStufe(katalog, stufe).map(k => [k.id, 'erreicht'])),
    beleg: { kriteriumId: 'H1', text: 'Ich war jeden Tag puenktlich.' },
    katalogVersion: katalog.version,
  }),
  erstellt: wann,
});

test('bekanntes Kind wird übernommen', () => {
  const r = kd.selbsteinschaetzungUebernehmen(datei, machUebergabe('Lea Müßig', 'ankerplatz', '2026-09-20T09:00:00Z'));
  assert.equal(r.art, 'neu');
  assert.equal(r.zeitraum, 1);
  assert.equal(r.stufeWeicht, false);
  assert.ok(kd.einschaetzung(datei, lea.id, 1, 'selbst'));
});
test('zweite Abgabe ersetzt die erste', () => {
  const r = kd.selbsteinschaetzungUebernehmen(datei, machUebergabe('lea müssig'.replace('ss','ß'), 'ankerplatz', '2026-09-21T09:00:00Z'));
  assert.equal(r.art, 'ersetzt');
  assert.equal(datei.einschaetzungen.filter(e => e.schuelerId === lea.id && e.quelle === 'selbst').length, 1);
});
test('abweichende Stufe wird gemeldet', () => {
  const r = kd.selbsteinschaetzungUebernehmen(datei, machUebergabe('Lea Müßig', 'boie', '2026-09-22T09:00:00Z'));
  assert.equal(r.stufeWeicht, true);
  assert.equal(r.gemeldeteStufe, 'boie');
  assert.equal(r.gefuehrteStufe, 'ankerplatz');
});
test('unbekannter Name wird gemeldet statt angelegt', () => {
  const r = kd.selbsteinschaetzungUebernehmen(datei, machUebergabe('Fremdes Kind', 'hafen', '2026-09-20T09:00:00Z'));
  assert.equal(r.art, 'unbekannt');
  assert.equal(datei.lernende.length, 2);
});
test('Fehlliste nennt die Nachzügler', () => {
  const fehlen = kd.fehlendeSelbsteinschaetzungen(datei, 1).map(l => l.name);
  assert.deepEqual(fehlen, ['Ali Demir']);
});
test('Fremdeinschätzung liegt neben der Selbsteinschätzung', () => {
  kd.einschaetzungSetzen(datei, { schuelerId: lea.id, zeitraum: 1, quelle: 'fremd',
    bewertungen: { H1: 'teilweise' } });
  assert.equal(kd.einschaetzung(datei, lea.id, 1, 'fremd').bewertungen.H1, 'teilweise');
  assert.equal(kd.einschaetzung(datei, lea.id, 1, 'selbst').bewertungen.H1, 'erreicht');
});
test('Stufenwechsel wird vermerkt', () => {
  const k = kd.stufeSetzen(datei, lea.id, 'boie');
  assert.equal(k.stufe, 'boie');
  assert.match(k.seit, /^\d{4}-\d{2}-\d{2}$/);
});

console.log('\nVerschlüsselung');
const bytes = await tresor.verschluesseln(datei, 'Seepferdchen-42!');
geprueft++; console.log('  ok  Runde durch Ver- und Entschlüsseln');
test('Geheimtext trägt die Kennung und ist kein Klartext', () => {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), 'GRADU1');
  assert.ok(!new TextDecoder().decode(bytes).includes('Lea'), 'Name im Klartext gefunden!');
});
const zurueck = await tresor.entschluesseln(bytes, 'Seepferdchen-42!');
test('entschlüsselt identisch', () => {
  assert.deepEqual(zurueck, JSON.parse(JSON.stringify(datei)));
});
await assert.rejects(() => tresor.entschluesseln(bytes, 'falsch'), /Passwort falsch/);
geprueft++; console.log('  ok  falsches Passwort scheitert sauber');
await assert.rejects(() => tresor.entschluesseln(new Uint8Array(80), 'x'), /keine Klassendatei/);
geprueft++; console.log('  ok  fremde Datei wird abgelehnt');
const zweite = await tresor.verschluesseln(datei, 'Seepferdchen-42!');
assert.notDeepEqual([...bytes.slice(6, 40)], [...zweite.slice(6, 40)]);
geprueft++; console.log('  ok  Salz und IV sind je Speichervorgang neu');
test('Passphrase-Güte', () => {
  assert.equal(tresor.passphraseGuete('kurz').stufe, 'schwach');
  assert.equal(tresor.passphraseGuete('Seepferdchen-42!').stufe, 'gut');
});

console.log(`\n${geprueft} Prüfungen bestanden.\n`);
