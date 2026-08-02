import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASIS = new URL('gemeinsam', import.meta.url).pathname;

const {
  katalogSetzen, kriterienDerStufe, bewertungszeilen,
  rueckstufungsgruende, nachbarStufe, stufenBisEinschliesslich, stufeNachEntscheidung,
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
// KONZEPT 7: Ein im Oktober gesetztes Kreuz muss weiter auf den Text zeigen,
// der damals danebenstand. Dafür liegt jede Fassung als Archiv daneben.
test('die laufende Fassung ist archiviert und deckungsgleich', () => {
  const archiv = JSON.parse(
    readFileSync(`${BASIS}/kataloge/katalog-${katalog.version}.json`, 'utf8')
  );
  assert.equal(archiv.version, katalog.version);
  // Der Hinweistext darf abweichen (er sagt, dass es ein Archiv ist) --
  // alles Inhaltliche muss gleich sein, sonst zeigt das Archiv etwas anderes.
  for (const feld of ['skala', 'stufen', 'kriterien']) {
    assert.deepEqual(archiv[feld], katalog[feld], `${feld} weicht vom Archiv ab`);
  }
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
test('Zielstufe einer Entscheidung, an den Enden bleibt sie stehen', () => {
  assert.equal(stufeNachEntscheidung(katalog, 'hafen', 'hoch'), 'ankerplatz');
  assert.equal(stufeNachEntscheidung(katalog, 'boie', 'runter'), 'ankerplatz');
  assert.equal(stufeNachEntscheidung(katalog, 'boie', 'gleich'), 'boie');
  assert.equal(stufeNachEntscheidung(katalog, 'hafen', 'runter'), 'hafen');
  assert.equal(stufeNachEntscheidung(katalog, 'freie-see', 'hoch'), 'freie-see');
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
test('Umbenennen zieht die Sortierung nach', () => {
  const kind = kd.lernendeUmbenennen(datei, lea.id, 'Zoe Winter');
  assert.equal(kind.name, 'Zoe Winter');
  assert.deepEqual(datei.lernende.map(l => l.name), ['Ali Demir', 'Zoe Winter']);
  kd.lernendeUmbenennen(datei, lea.id, 'Lea Müßig'); // zurück für die folgenden Prüfungen
});

test('Umbenennen auf einen vergebenen Namen wird abgewiesen', () => {
  assert.throws(() => kd.lernendeUmbenennen(datei, lea.id, 'ali demir'), /Klassenliste/);
  assert.throws(() => kd.lernendeUmbenennen(datei, lea.id, '   '), /leer/);
  assert.equal(datei.lernende.find(l => l.id === lea.id).name, 'Lea Müßig');
});

// Verwaiste Einschätzungen wären in keiner Ansicht mehr sichtbar, aber weiter
// in der Datei -- bei Verhaltensdaten Minderjähriger das Gegenteil von Löschen.
test('Entfernen nimmt Einschätzungen und Coachings mit', () => {
  const opfer = kd.lernendeAnlegen(datei, 'Timo Probe', 'hafen');
  kd.einschaetzungSetzen(datei, { schuelerId: opfer.id, zeitraum: 1, quelle: 'selbst',
    bewertungen: { H1: 'erreicht' } });
  kd.coachingEintragen(datei, { schuelerId: opfer.id, zeitraum: 4, entscheidung: 'gleich',
    nachStufe: 'hafen', begruendung: 'Bleibt vorerst im Hafen.' });

  const bilanz = kd.lernendeEntfernen(datei, opfer.id);
  assert.deepEqual([bilanz.name, bilanz.einschaetzungen, bilanz.coachings], ['Timo Probe', 1, 1]);
  assert.equal(datei.lernende.some(l => l.id === opfer.id), false);
  assert.equal(datei.einschaetzungen.some(e => e.schuelerId === opfer.id), false);
  assert.equal(datei.coachings.some(c => c.schuelerId === opfer.id), false);
});

test('Entfernen lässt die übrigen Kinder unberührt', () => {
  assert.deepEqual(datei.lernende.map(l => l.name), ['Ali Demir', 'Lea Müßig']);
  assert.ok(kd.einschaetzung(datei, lea.id, 1, 'selbst'), 'Leas Einschätzung ist weg');
});

test('Stufenwechsel wird vermerkt', () => {
  const k = kd.stufeSetzen(datei, lea.id, 'boie');
  assert.equal(k.stufe, 'boie');
  assert.match(k.seit, /^\d{4}-\d{2}-\d{2}$/);
});

// Das ist der Weg hinter „Stufe übernehmen" im Import: Die gemeldete Stufe wird
// die geführte, und danach meldet derselbe Import keine Abweichung mehr.
test('übernommene Stufe beendet die Abweichung', () => {
  const vorher = kd.selbsteinschaetzungUebernehmen(
    datei, machUebergabe('Lea Müßig', 'freie-see', '2026-09-23T09:00:00Z'));
  assert.equal(vorher.stufeWeicht, true);

  kd.stufeSetzen(datei, vorher.schuelerId, vorher.gemeldeteStufe);

  const danach = kd.selbsteinschaetzungUebernehmen(
    datei, machUebergabe('Lea Müßig', 'freie-see', '2026-09-23T09:00:00Z'));
  assert.equal(danach.stufeWeicht, false);
  assert.equal(datei.lernende.find(l => l.id === vorher.schuelerId).stufe, 'freie-see');
});

console.log('\nSchuljahresende');
{
  // Eigene Datei, damit die Löschprüfungen den übrigen Prüfungen nicht den
  // Datenbestand unter den Füßen wegziehen.
  const jahr = kd.klasseAnlegen({ klasse: '8c', schuljahr: '2026/27',
    zyklusStart: '2026-09-14', katalogVersion: katalog.version });
  const kind = kd.lernendeAnlegen(jahr, 'Mara Testkind', 'hafen');
  kd.einschaetzungSetzen(jahr, { schuelerId: kind.id, zeitraum: 1, quelle: 'selbst',
    bewertungen: { H1: 'erreicht' }, beleg: { kriteriumId: 'H1', text: 'War jeden Tag pünktlich.' } });
  kd.einschaetzungSetzen(jahr, { schuelerId: kind.id, zeitraum: 1, quelle: 'fremd',
    bewertungen: { H1: 'teilweise' } });
  kd.coachingEintragen(jahr, { schuelerId: kind.id, zeitraum: 4, entscheidung: 'hoch',
    nachStufe: 'ankerplatz', begruendung: 'Trägt Verantwortung zuverlässig.',
    vereinbarungen: 'Meldet sich in Inputphasen.', gueltigAb: '2026-11-09' });

  test('Bilanz nennt vorher, was verschwindet', () => {
    const b = kd.abschlussBilanz(jahr);
    assert.deepEqual([b.einschaetzungen, b.belege, b.coachings, b.texte], [2, 1, 1, 1]);
  });

  test('Rohdaten weg, Stufenhistorie bleibt', () => {
    const ergebnis = kd.rohdatenLoeschen(jahr);
    assert.equal(ergebnis.einschaetzungen, 2);
    assert.equal(jahr.einschaetzungen.length, 0, 'Einschätzungen sind noch da');
    assert.equal(jahr.lernende.length, 1, 'die Kinder sollen bleiben');
    assert.equal(jahr.coachings.length, 1, 'das Coaching-Gerüst soll bleiben');

    const verlauf = kd.stufenverlauf(jahr, kind.id);
    assert.deepEqual(verlauf.map(s => s.stufe), ['hafen', 'ankerplatz']);
    assert.equal(verlauf.at(-1).ab, '2026-11-09');
  });

  test('ohne Zusatz bleiben die Freitexte der Gespräche stehen', () => {
    assert.equal(jahr.coachings[0].begruendung, 'Trägt Verantwortung zuverlässig.');
    assert.equal(jahr.coachings[0].vereinbarungen, 'Meldet sich in Inputphasen.');
    assert.equal(jahr.abschluss.texteGeloescht, false);
  });

  test('mit Zusatz gehen auch die Freitexte, der Verlauf bleibt', () => {
    kd.rohdatenLoeschen(jahr, { texte: true });
    assert.equal(jahr.coachings[0].begruendung, '');
    assert.equal(jahr.coachings[0].vereinbarungen, '');
    assert.deepEqual(jahr.coachings[0].gruende, []);
    assert.equal(jahr.abschluss.texteGeloescht, true);
    assert.deepEqual(kd.stufenverlauf(jahr, kind.id).map(s => s.stufe), ['hafen', 'ankerplatz']);
  });

  test('gelöschte Klassendatei überlebt Ver- und Entschlüsseln', async () => {
    const fach = await tresor.tresorAnlegen('Nordwind-77?');
    const zurueckGelesen = await tresor.tresorOeffnen(await tresor.verschluesseln(jahr, fach), 'Nordwind-77?');
    assert.deepEqual(kd.pruefen(zurueckGelesen.inhalt).abschluss, jahr.abschluss);
  });
}

console.log('\nVerschlüsselung');
const geheimfach = await tresor.tresorAnlegen('Seepferdchen-42!');
const bytes = await tresor.verschluesseln(datei, geheimfach);
geprueft++; console.log('  ok  Runde durch Ver- und Entschlüsseln');
test('Geheimtext trägt die Kennung und ist kein Klartext', () => {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), 'GRADU1');
  assert.ok(!new TextDecoder().decode(bytes).includes('Lea'), 'Name im Klartext gefunden!');
});
const zurueck = await tresor.tresorOeffnen(bytes, 'Seepferdchen-42!');
test('entschlüsselt identisch', () => {
  assert.deepEqual(zurueck.inhalt, JSON.parse(JSON.stringify(datei)));
});
await assert.rejects(() => tresor.tresorOeffnen(bytes, 'falsch'), /Passwort falsch/);
geprueft++; console.log('  ok  falsches Passwort scheitert sauber');
await assert.rejects(() => tresor.tresorOeffnen(new Uint8Array(80), 'x'), /keine Klassendatei/);
geprueft++; console.log('  ok  fremde Datei wird abgelehnt');

// Das Salz bleibt je Datei gleich, damit der Schlüssel nur einmal abgeleitet
// werden muss. Frisch sein muss der IV -- sonst wäre AES-GCM angreifbar.
const zweite = await tresor.verschluesseln(datei, geheimfach);
const salzVon = (d) => [...d.slice(7, 23)].join(',');
const ivVon = (d) => [...d.slice(23, 35)].join(',');
test('gleiches Salz, aber je Speichervorgang ein neuer IV', () => {
  assert.equal(salzVon(bytes), salzVon(zweite), 'Salz soll gleich bleiben');
  assert.notEqual(ivVon(bytes), ivVon(zweite), 'IV muss sich unterscheiden');
  assert.notDeepEqual([...bytes], [...zweite], 'Geheimtexte dürfen nicht gleich sein');
});

// Nach dem Öffnen wird mit dem Schlüssel aus der Datei weitergeschrieben --
// die Passphrase wird dafür nicht noch einmal gebraucht.
const geaendert = { ...JSON.parse(JSON.stringify(datei)), klasse: '9b' };
const spaeter = await tresor.verschluesseln(geaendert, zurueck.tresor);
test('der Tresor einer geöffneten Datei schreibt weiter', async () => {
  assert.deepEqual((await tresor.tresorOeffnen(spaeter, 'Seepferdchen-42!')).inhalt, geaendert);
});
test('Passphrase-Güte', () => {
  assert.equal(tresor.passphraseGuete('kurz').stufe, 'schwach');
  assert.equal(tresor.passphraseGuete('Seepferdchen-42!').stufe, 'gut');
});

// Der Weg hinter „Passwort ändern": frischer Tresor, Datei einmal komplett neu
// geschrieben. Die alten Bytes lassen sich nicht nachtraeglich umschluesseln --
// deshalb muss die neu geschriebene Datei mit dem alten Passwort scheitern.
const neuerTresor = await tresor.tresorAnlegen('Nordwind-77?');
const neuGeschrieben = await tresor.verschluesseln(datei, neuerTresor);

test('nach dem Passwortwechsel gilt nur noch das neue Passwort', async () => {
  assert.deepEqual(
    (await tresor.tresorOeffnen(neuGeschrieben, 'Nordwind-77?')).inhalt,
    JSON.parse(JSON.stringify(datei))
  );
  await assert.rejects(
    () => tresor.tresorOeffnen(neuGeschrieben, 'Seepferdchen-42!'),
    /Passwort falsch/
  );
  assert.notEqual(salzVon(neuGeschrieben), salzVon(bytes), 'neues Passwort braucht neues Salz');
});

// Wichtig fuer die Rueckabwicklung in `passwortWechseln()`: Schlaegt das
// Schreiben fehl, gilt in der bereits abgelegten Datei weiterhin das alte
// Passwort -- der alte Tresor muss sie also unveraendert oeffnen.
test('eine früher abgelegte Datei bleibt beim alten Passwort', async () => {
  assert.deepEqual(
    (await tresor.tresorOeffnen(bytes, 'Seepferdchen-42!')).inhalt,
    JSON.parse(JSON.stringify(datei))
  );
});


console.log('\nKlassenaufbau aus Importen');
const datei2 = kd.klasseAnlegen({ klasse: '7b', schuljahr: '2026/27',
  zyklusStart: '2026-09-14', katalogVersion: katalog.version });

test('Namensliste legt mehrere auf einmal an', () => {
  const angelegt = kd.lernendeAusListe(datei2, ' Mia Roth \n\nTom Berg\n Mia Roth \n', 'hafen');
  assert.equal(angelegt.length, 2, 'Doppelter Name darf nicht zweimal angelegt werden');
  assert.deepEqual(datei2.lernende.map(l => l.name), ['Mia Roth', 'Tom Berg']);
});

test('ähnliche Namen werden gefunden', () => {
  assert.deepEqual(kd.aehnlicheNamen(datei2, 'Mia Rot').map(l => l.name), ['Mia Roth']);
  assert.deepEqual(kd.aehnlicheNamen(datei2, 'mia  roth').map(l => l.name), ['Mia Roth']);
  assert.deepEqual(kd.aehnlicheNamen(datei2, 'Zeynep Kaya'), []);
});

const fremdeUebergabe = uebergabeErzeugen({
  schueler: { name: 'Mia Rot', klasse: '7b' }, stufe: 'hafen',
  bewertungen: Object.fromEntries(kriterienDerStufe(katalog, 'hafen').map(k => [k.id, 'erreicht'])),
  beleg: { kriteriumId: 'H1', text: 'Ich habe anderen geholfen.' },
  katalogVersion: katalog.version,
});

test('Tippfehler-Name wird nicht still angelegt', () => {
  const r = kd.selbsteinschaetzungUebernehmen(datei2, fremdeUebergabe);
  assert.equal(r.art, 'unbekannt');
  assert.equal(datei2.lernende.length, 2);
});

test('Zuordnen schreibt auf das vorhandene Kind', () => {
  const mia = kd.lernendeSuchen(datei2, 'Mia Roth');
  const r = kd.uebergabeZuordnen(datei2, fremdeUebergabe, mia.id);
  assert.equal(r.art, 'neu');
  assert.equal(r.name, 'Mia Roth');
  assert.equal(datei2.lernende.length, 2, 'Es darf kein zweites Kind entstanden sein');
  assert.ok(kd.einschaetzung(datei2, mia.id, 1, 'selbst'));
});

test('bewusstes Anlegen erzeugt Kind samt Einschätzung', () => {
  const neue = uebergabeErzeugen({
    schueler: { name: 'Zeynep Kaya', klasse: '7b' }, stufe: 'boie',
    bewertungen: Object.fromEntries(kriterienDerStufe(katalog, 'boie').map(k => [k.id, 'teilweise'])),
    beleg: { kriteriumId: 'B1', text: 'Ich habe mein Ziel erreicht.' },
    katalogVersion: katalog.version,
  });
  const r = kd.uebergabeAlsNeuesKind(datei2, neue);
  assert.equal(r.art, 'neu');
  const kind = kd.lernendeSuchen(datei2, 'Zeynep Kaya');
  assert.equal(kind.stufe, 'boie', 'gemeldete Stufe wird übernommen');
  assert.ok(kd.einschaetzung(datei2, kind.id, 1, 'selbst'));
});


console.log('\nCoaching und Stufenverlauf');
const datei3 = kd.klasseAnlegen({ klasse: '9a', schuljahr: '2026/27',
  zyklusStart: '2026-09-14', katalogVersion: katalog.version });
const tom = kd.lernendeAnlegen(datei3, 'Tom Berg', 'hafen');

test('Hochstufung ändert die Stufe und hält das Gespräch fest', () => {
  const c = kd.coachingEintragen(datei3, { schuelerId: tom.id, zeitraum: 4,
    entscheidung: 'hoch', nachStufe: stufeNachEntscheidung(katalog, tom.stufe, 'hoch'),
    datum: '2026-11-06', gueltigAb: '2026-11-09', ausweisUebergeben: true });
  assert.equal(c.vonStufe, 'hafen');
  assert.equal(c.nachStufe, 'ankerplatz');
  assert.deepEqual(c.zeitraeume, [1, 2, 3, 4]);
  assert.equal(kd.lernendeSuchen(datei3, 'Tom Berg').stufe, 'ankerplatz');
  assert.equal(kd.lernendeSuchen(datei3, 'Tom Berg').seit, '2026-11-09');
});

test('Stufe halten lässt die Stufe unverändert', () => {
  const c = kd.coachingEintragen(datei3, { schuelerId: tom.id, zeitraum: 8,
    entscheidung: 'gleich', nachStufe: stufeNachEntscheidung(katalog, tom.stufe, 'gleich'),
    datum: '2027-01-15', begruendung: 'Termine noch unzuverlässig.' });
  assert.equal(c.nachStufe, 'ankerplatz');
  assert.equal(kd.lernendeSuchen(datei3, 'Tom Berg').stufe, 'ankerplatz');
});

test('Rückstufung geht eine Stufe zurück, mit Gründen', () => {
  const c = kd.coachingEintragen(datei3, { schuelerId: tom.id, zeitraum: 12,
    entscheidung: 'runter', nachStufe: stufeNachEntscheidung(katalog, tom.stufe, 'runter'),
    datum: '2027-03-12', gruende: ['H2', 'A1'],
    vereinbarungen: 'Logbuch freitags vorzeigen.' });
  assert.equal(c.nachStufe, 'hafen');
  assert.deepEqual(c.gruende, ['H2', 'A1']);
  assert.equal(kd.lernendeSuchen(datei3, 'Tom Berg').stufe, 'hafen');
});

test('unterste Stufe lässt sich nicht weiter zurückstufen', () => {
  const c = kd.coachingEintragen(datei3, { schuelerId: tom.id, zeitraum: 16,
    entscheidung: 'runter', nachStufe: stufeNachEntscheidung(katalog, tom.stufe, 'runter'),
    datum: '2027-05-07' });
  assert.equal(c.nachStufe, 'hafen');
});

test('Stufenverlauf bildet den Weg vollständig ab', () => {
  const verlauf = kd.stufenverlauf(datei3, tom.id);
  assert.deepEqual(verlauf.map(s => s.stufe), ['hafen', 'ankerplatz', 'ankerplatz', 'hafen', 'hafen']);
  assert.equal(verlauf[0].ab, null, 'Startpunkt hat kein Datum');
  assert.equal(verlauf[1].anlass, 'hoch');
});

test('Coachings kommen neueste zuerst', () => {
  const liste = kd.coachingsVon(datei3, tom.id);
  assert.equal(liste.length, 4);
  assert.ok(liste[0].datum > liste[1].datum);
});

test('Erfassungsstand zählt nur die geforderten Zeilen', () => {
  const zeilen = bewertungszeilen(katalog, 'ankerplatz').map(z => z.id);
  assert.deepEqual(zeilen, ['stufe:hafen', 'A1', 'A2']);
  kd.einschaetzungSetzen(datei3, { schuelerId: tom.id, zeitraum: 1, quelle: 'fremd',
    bewertungen: { 'stufe:hafen': 'erreicht', A1: 'teilweise' } });
  const stand = kd.erfassungsstand(datei3, tom.id, 1, 'fremd', zeilen);
  assert.deepEqual([stand.erfasst, stand.gesamt, stand.vollstaendig], [2, 3, false]);
  kd.einschaetzungSetzen(datei3, { schuelerId: tom.id, zeitraum: 1, quelle: 'fremd',
    bewertungen: { A2: 'erreicht' } });
  assert.equal(kd.erfassungsstand(datei3, tom.id, 1, 'fremd', zeilen).vollstaendig, true);
});

console.log('\nBeispieldaten');
const { beispielklasse } = await import(`${BASIS}/beispieldaten.js`);
const beispiel = beispielklasse(katalog);

test('Beispielklasse hat Kinder, Einschätzungen und Coachings', () => {
  assert.equal(beispiel.lernende.length, 14);
  assert.ok(beispiel.coachings.length >= 28, `nur ${beispiel.coachings.length} Coachings`);
  assert.ok(beispiel.einschaetzungen.length > 300);
  assert.equal(beispiel.beispiel, true, 'Kennzeichnung fehlt -- sonst würde gespeichert');
});

test('Beispielverläufe enthalten Hoch- und Rückstufungen', () => {
  const arten = new Set(beispiel.coachings.map(c => c.entscheidung));
  assert.ok(arten.has('hoch') && arten.has('runter') && arten.has('gleich'),
    `nur: ${[...arten].join(', ')}`);
});

test('jedes Beispielkind hat einen mehrstufigen Verlauf', () => {
  for (const kind of beispiel.lernende) {
    const verlauf = kd.stufenverlauf(beispiel, kind.id);
    assert.ok(verlauf.length >= 3, `${kind.name}: nur ${verlauf.length} Schritte`);
  }
});

test('Beispiel ist reproduzierbar', () => {
  const zweite = beispielklasse(katalog);
  assert.deepEqual(zweite.lernende.map(l => l.stufe), beispiel.lernende.map(l => l.stufe));
  assert.deepEqual(zweite.coachings.map(c => c.entscheidung), beispiel.coachings.map(c => c.entscheidung));
});

/**
 * Vorher zeigte der Beleg immer auf das erste Kriterium der Stufe, während der
 * Text zufällig gezogen wurde -- im Coaching-Bogen stand dann derselbe Satzkopf
 * über Sätzen, die von etwas ganz anderem handelten.
 */
test('Belegsätze zeigen auf ein Kriterium, das auf der Stufe gilt', () => {
  const selbst = beispiel.einschaetzungen.filter(e => e.quelle === 'selbst');
  assert.ok(selbst.length, 'keine Selbsteinschätzungen im Beispiel');
  for (const e of selbst) {
    assert.ok(e.beleg?.kriteriumId, 'Belegsatz ohne Kriterium');
    const gueltig = kriterienDerStufe(katalog, e.stufe).map(k => k.id);
    assert.ok(gueltig.includes(e.beleg.kriteriumId),
      `${e.beleg.kriteriumId} gilt auf Stufe ${e.stufe} nicht`);
  }
});

test('Belegsätze verteilen sich über mehrere Kriterien', () => {
  const verwendet = new Set(
    beispiel.einschaetzungen.filter(e => e.quelle === 'selbst').map(e => e.beleg.kriteriumId)
  );
  assert.ok(verwendet.size >= 4, `nur ${verwendet.size} verschiedene Kriterien belegt`);
});

// Der Coaching-Bogen zeigt vier Zeiträume nebeneinander -- stünde dort viermal
// derselbe Satz, entwertet das die Demo an genau der Stelle, die sie zeigt.
test('kein Belegsatz wiederholt sich bei einem Kind direkt', () => {
  for (const kind of beispiel.lernende) {
    const ids = beispiel.einschaetzungen
      .filter(e => e.quelle === 'selbst' && e.schuelerId === kind.id)
      .sort((a, b) => a.zeitraum - b.zeitraum)
      .map(e => e.beleg.kriteriumId);
    for (let i = 1; i < ids.length; i++) {
      assert.notEqual(ids[i], ids[i - 1], `${kind.name}: ${ids[i]} zweimal hintereinander`);
    }
  }
});

test('Rückstufungen im Beispiel tragen Gründe aus dem Katalog', () => {
  const runter = beispiel.coachings.filter(c => c.entscheidung === 'runter');
  assert.ok(runter.length, 'keine Rückstufung im Beispiel');
  for (const c of runter) {
    assert.ok(c.gruende.length, 'Rückstufung ohne Gründe');
    for (const id of c.gruende) {
      assert.ok(katalog.kriterien.some(k => k.id === id), `unbekannter Grund ${id}`);
    }
  }
});


console.log('\nCoaching-Bogen: Selbst- und Fremdsicht nebeneinander');
const { zeilenwert } = await import(`${BASIS}/katalog.js`);

test('Zeilenwert nimmt den schlechtesten Einzelwert', () => {
  const alle = { H1: 'erreicht', H2: 'erreicht', H3: 'erreicht' };
  assert.equal(zeilenwert(katalog, alle, ['H1','H2','H3']), 'erreicht');
  assert.equal(zeilenwert(katalog, { ...alle, H2: 'teilweise' }, ['H1','H2','H3']), 'teilweise');
  assert.equal(zeilenwert(katalog, { ...alle, H2: 'teilweise', H3: 'nicht' }, ['H1','H2','H3']), 'nicht');
});

test('Zeilenwert ignoriert fehlende und unbekannte Werte', () => {
  assert.equal(zeilenwert(katalog, { H1: 'erreicht' }, ['H1','H2']), 'erreicht');
  assert.equal(zeilenwert(katalog, {}, ['H1','H2']), null);
  assert.equal(zeilenwert(katalog, undefined, ['H1']), null);
  assert.equal(zeilenwert(katalog, { H1: 'quatsch' }, ['H1']), null);
});

test('so lassen sich beide Sichten je Zeile vergleichen', () => {
  // Kind kreuzt Einzelkriterien an, Lehrkraft die Sammelzeile
  const bogen = kd.klasseAnlegen({ klasse: '8c', schuljahr: '2026/27',
    zyklusStart: '2026-09-14', katalogVersion: katalog.version });
  const kind = kd.lernendeAnlegen(bogen, 'Nora Klein', 'ankerplatz');

  kd.einschaetzungSetzen(bogen, { schuelerId: kind.id, zeitraum: 1, quelle: 'selbst',
    bewertungen: Object.fromEntries(kriterienDerStufe(katalog, 'ankerplatz').map(k => [k.id, 'erreicht'])) });
  kd.einschaetzungSetzen(bogen, { schuelerId: kind.id, zeitraum: 1, quelle: 'fremd',
    bewertungen: { 'stufe:hafen': 'teilweise', A1: 'erreicht', A2: 'erreicht' } });

  const zeilen = bewertungszeilen(katalog, 'ankerplatz');
  const selbst = kd.einschaetzung(bogen, kind.id, 1, 'selbst').bewertungen;
  const fremd = kd.einschaetzung(bogen, kind.id, 1, 'fremd').bewertungen;

  const paare = zeilen.map(z => ({
    zeile: z.id,
    s: zeilenwert(katalog, selbst, z.enthaelt.map(k => k.id)),
    l: fremd[z.id] ?? null,
  }));
  assert.deepEqual(paare, [
    { zeile: 'stufe:hafen', s: 'erreicht', l: 'teilweise' },
    { zeile: 'A1', s: 'erreicht', l: 'erreicht' },
    { zeile: 'A2', s: 'erreicht', l: 'erreicht' },
  ]);
  // genau eine Abweichung -- die wird im Bogen hervorgehoben
  assert.equal(paare.filter(p => p.s && p.l && p.s !== p.l).length, 1);
});

console.log(`\n${geprueft} Prüfungen bestanden.\n`);
