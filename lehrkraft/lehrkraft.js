// Lehrkraft-Anwendung.
// Klassendatei anlegen/öffnen/speichern, Klassenübersicht, Import der
// AirDrop-Dateien, Fremdeinschätzung, Verlauf je Kind, Coaching-Gespräch
// mit Bogen, Entscheidung und Druckansicht.

import {
  katalogLaden, katalogFassung, stufe, bewertungszeilen, kriterienDerStufe, zeilenwert,
  praeposition, nachbarStufe, stufeNachEntscheidung, rueckstufungsgruende,
} from '../gemeinsam/katalog.js';
import { uebergabePruefen } from '../gemeinsam/uebergabe.js';
import { verschluesseln, tresorAnlegen, tresorOeffnen, passphraseGuete } from '../gemeinsam/tresor.js';
import { dateiSpeicher } from '../gemeinsam/speicher.js';
import { qrAlsSvg } from '../gemeinsam/qr.js';
import * as kd from '../gemeinsam/klassendatei.js';

const $ = (a) => document.querySelector(a);
const SICHERUNG_TAGE = 7;      // Rhythmus aus KONZEPT Abschnitt 6
const SICHERUNGEN_BEHALTEN = 10;

// Zwei Kataloge, und der Unterschied ist wichtig:
//   `katalogAktuell` ist die heute ausgelieferte Fassung -- daran hängen neue
//   Klassen und die Schüleranwendung.
//   `katalog` ist die Fassung, gegen die die *geöffnete* Klassendatei gilt.
// Solange nichts geändert wurde, sind beide dasselbe Objekt.
let katalogAktuell;
let katalog;
let katalogstand = 'aktuell'; // 'aktuell' | 'alt' | 'fehlt'
let datei = null;      // die entschlüsselte Klassendatei
let tresor = null;     // Salz + Schlüssel, nur im Arbeitsspeicher; der Schlüssel
                       // ist nicht auslesbar, die Passphrase steht nirgends
let zeileAktiv = null; // gewählte Zeile der Fremdeinschätzung
let offeneImporte = []; // Namen, die noch zugeordnet werden müssen
let stufenkonflikte = []; // Kinder, deren gemeldete Stufe von der geführten abweicht
// null = der Zeitraum, in den heute fällt. Frei wählbar, damit sich
// ausgelassene Runden nachtragen und Gespräche vorziehen lassen.
let zeitraumWahl = null;

/**
 * Wohin die Klassendatei geschrieben wird -- hinter einer Schnittstelle
 * (KONZEPT Abschnitt 7). Diese Datei spricht nirgends mehr direkt mit der
 * File System Access API; ein `SchulcloudSpeicher` wäre ein Austausch dieser
 * einen Zeile.
 */
const speicher = dateiSpeicher({
  ablage: 'graduierung.lehrkraft.dateigriff',
  ordnerAblage: 'graduierung.lehrkraft.sicherungsordner',
});

// ---------------------------------------------------------------- Start

async function starten() {
  try {
    katalogAktuell = await katalogLaden('../gemeinsam');
    katalog = katalogAktuell;
  } catch (fehler) {
    $('#ladefehler').textContent = `Die Anwendung konnte nicht geladen werden: ${fehler.message}`;
    $('#ladefehler').hidden = false;
    return;
  }
  einstiegVerdrahten();
  navigationVerdrahten();
  importVerdrahten();
  klassenlisteVerdrahten(); // hängt am Container, überlebt jedes Neuzeichnen
  fremdVerdrahten();

  $('#coaching-zurueck').addEventListener('click', coachingBereitZeigen);
  $('#stufencode-zu').addEventListener('click', () => { $('#stufencode').hidden = true; });
  $('#coaching-drucken').addEventListener('click', () => window.print());
  $('#auskunft-drucken').addEventListener('click', () => window.print());
  $('#formular-coaching').addEventListener('submit', (e) => {
    e.preventDefault();
    coachingSpeichern();
  });
  $('#kind-anlegen').addEventListener('click', kindAnlegen);
  dateiVerdrahten();
  $('#leiste-zeitraum').addEventListener('change', (e) => {
    zeitraumWahl = Number(e.target.value);
    allesZeichnen();
  });
  $('#zeitraum-heute').addEventListener('click', () => {
    zeitraumWahl = null;
    allesZeichnen();
  });
  $('#kind-zurueck').addEventListener('click', () => {
    document.querySelector('.navigation button[data-ansicht="uebersicht"]').click();
  });
  offlineBereitstellen();
}

/**
 * Meldet den Service Worker an. `sw.js` cacht die Lehrkraft-Dateien längst mit,
 * nur meldete ihn bisher allein die Schüleranwendung an -- die Lehrkraft-App
 * lief deshalb als einzige nicht offline, obwohl alles dafür bereitlag.
 *
 * Zwischengespeichert wird ausschließlich die Anwendung selbst. Die
 * Klassendaten liegen in einer Datei auf der Festplatte und laufen nie durch
 * `fetch` -- sie können hier gar nicht in einen Cache geraten.
 *
 * Scheitert die Anmeldung (etwa über http:// im Testbetrieb), läuft alles
 * Übrige unverändert weiter.
 */
function offlineBereitstellen() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
}

function einstiegVerdrahten() {
  $('#datei-neu').addEventListener('click', () => bereich('formular-neu'));
  $('#datei-oeffnen').addEventListener('click', dateiWaehlen);
  zuletztAnbieten();
  for (const knopf of document.querySelectorAll('[data-zurueck]')) {
    knopf.addEventListener('click', () => bereich('einstieg-start'));
  }
  $('#neu-passwort').addEventListener('input', (e) => {
    const g = passphraseGuete(e.target.value);
    $('#neu-guete').textContent = g.text;
    $('#neu-guete').dataset.stufe = g.stufe;
  });
  $('#formular-neu').addEventListener('submit', (e) => { e.preventDefault(); klasseAnlegen(); });
  $('#formular-oeffnen').addEventListener('submit', (e) => { e.preventDefault(); dateiOeffnen(); });

  $('#beispiel-oeffnen').addEventListener('click', async () => {
    const { beispielklasse } = await import('../gemeinsam/beispieldaten.js');
    katalog = katalogAktuell; // die Beispielklasse entsteht mit der heutigen Fassung
    katalogstand = 'aktuell';
    datei = beispielklasse(katalog);
    tresor = null;
    speicher.schliessen();
    offeneImporte = [];
    stufenkonflikte = [];
    anwendungZeigen();
  });
  $('#beispiel-beenden').addEventListener('click', () => location.reload());

  const start = $('#neu-start');
  if (!start.value) start.value = new Date().toISOString().slice(0, 10);
}

function bereich(welcher) {
  for (const id of ['einstieg-start', 'formular-neu', 'formular-oeffnen']) {
    $(`#${id}`).hidden = id !== welcher;
  }
}

// ---------------------------------------------------------------- Datei

async function klasseAnlegen() {
  const klasse = $('#neu-klasse').value.trim();
  const schuljahr = $('#neu-schuljahr').value.trim();
  const start = $('#neu-start').value;
  const pw = $('#neu-passwort').value;
  const meldung = $('#neu-fehler');

  const fehlt = [];
  if (!klasse) fehlt.push('die Klasse');
  if (!schuljahr) fehlt.push('das Schuljahr');
  if (!start) fehlt.push('den Startpunkt');
  if (pw.length < 8) fehlt.push('ein Passwort mit mindestens 8 Zeichen');
  if (fehlt.length) {
    meldung.textContent = `Es fehlt noch: ${fehlt.join(', ')}.`;
    meldung.hidden = false;
    return;
  }
  meldung.hidden = true;

  // Neue Klassen entstehen immer mit der heutigen Fassung
  katalog = katalogAktuell;
  katalogstand = 'aktuell';
  datei = kd.klasseAnlegen({
    klasse, schuljahr, zyklusStart: start, katalogVersion: katalogAktuell.version,
  });
  kd.lernendeAusListe(datei, $('#neu-namen').value, katalog.stufen[0].id);
  tresor = await tresorAnlegen(pw);
  speicher.schliessen();
  if (await speichern({ neuerOrt: true })) anwendungZeigen();
}

/**
 * „App merkt sich die Datei" aus KONZEPT Abschnitt 6. Der Ort liegt beim
 * Speicher; beim Start wird er als eigener Knopf angeboten.
 *
 * Die Berechtigung wird **nicht** hier abgefragt, sondern erst im Klick auf den
 * Knopf: Der Browser beantwortet die Nachfrage außerhalb einer Nutzergeste
 * ohne Rückfrage mit Nein, und der gemerkte Ort wäre verbrannt.
 */
async function zuletztAnbieten() {
  const gemerkt = await speicher.zuletztBenutzt();
  if (!gemerkt) return;

  $('#zuletzt-name').textContent = gemerkt.name;
  $('#zuletzt').hidden = false;

  $('#zuletzt-oeffnen').addEventListener('click', async () => {
    const uebernommen = await speicher.zuletztUebernehmen();
    if (!uebernommen) {
      $('#zuletzt-name').textContent = `${gemerkt.name} – Zugriff verweigert`;
      return;
    }
    $('#oeffnen-name').textContent = uebernommen.name;
    bereich('formular-oeffnen');
    $('#oeffnen-passwort').focus();
  });

  $('#zuletzt-vergessen').addEventListener('click', async () => {
    await speicher.zuletztVergessen();
    $('#zuletzt').hidden = true;
  });
}

async function dateiWaehlen() {
  const gewaehlt = await speicher.waehlenZumOeffnen();
  if (!gewaehlt) return; // abgebrochen
  $('#oeffnen-name').textContent = gewaehlt.name;
  bereich('formular-oeffnen');
  $('#oeffnen-passwort').focus();
}

async function dateiOeffnen() {
  const meldung = $('#oeffnen-fehler');
  try {
    const geoeffnet = await tresorOeffnen(await speicher.lesen(), $('#oeffnen-passwort').value);
    datei = kd.pruefen(geoeffnet.inhalt);
    tresor = geoeffnet.tresor;
    $('#oeffnen-passwort').value = ''; // ab hier trägt der Tresor den Schlüssel
    meldung.hidden = true;
    await katalogFuerDateiWaehlen();
    anwendungZeigen();
    // Noch in der Nutzergeste des Absendens -- nur hier darf der gemerkte
    // Sicherungsordner nach seiner Berechtigung gefragt werden.
    await wochensicherungPruefen();
  } catch (fehler) {
    meldung.textContent = fehler.message;
    meldung.hidden = false;
  }
}

/**
 * Sucht die Katalogfassung, gegen die diese Klassendatei gilt.
 *
 * Das ist der Kern von KONZEPT Abschnitt 7: Ein im Oktober gesetztes Kreuz muss
 * weiter auf den Text zeigen, der damals danebenstand. Sonst ändert sich
 * rückwirkend, was ein Kind angekreuzt hat -- und das ist bei einer
 * Verhaltensbeurteilung kein Schönheitsfehler.
 */
async function katalogFuerDateiWaehlen() {
  const version = datei.katalogVersion;

  if (version === katalogAktuell.version || version == null) {
    katalog = katalogAktuell;
    katalogstand = 'aktuell';
    return;
  }

  const alt = await katalogFassung('../gemeinsam', version);
  if (alt) {
    katalog = alt;
    katalogstand = 'alt';
    return;
  }

  // Nicht archiviert -- dann lieber die heutigen Texte zeigen und es sagen,
  // als die Klasse gar nicht zu öffnen.
  katalog = katalogAktuell;
  katalogstand = 'fehlt';
}

/** Übernimmt die heutige Fassung für diese Klassendatei -- eine Entscheidung. */
function katalogUmstellen() {
  if (!confirm(
    `Diese Klasse künftig gegen Fassung ${katalogAktuell.version} des Kriterienkatalogs führen?\n\n` +
      `Ab dann zeigen auch die bisherigen Einschätzungen die heutigen Kriterientexte – ` +
      `auch dort, wo beim Ankreuzen etwas anderes danebenstand.\n\n` +
      `Die Kreuze selbst ändern sich nicht.`
  )) return;

  datei.katalogVersion = katalogAktuell.version;
  katalog = katalogAktuell;
  katalogstand = 'aktuell';
  merken();
  allesZeichnen();
}

let schreibvorgang = Promise.resolve();

/**
 * Schreibt die Datei zurück. Ohne Schreibrecht wird sie heruntergeladen.
 *
 * Aufrufe laufen streng nacheinander: Ein Speichervorgang dauert wegen der
 * Verschlüsselung einige Zeit, und in dieser Spanne kann die nächste Änderung
 * bereits den nächsten auslösen. Zwei gleichzeitig offene Schreibströme auf
 * dieselbe Datei wären eine gute Gelegenheit für eine halb geschriebene
 * Klassendatei -- und die ist verschlüsselt, also nicht von Hand zu retten.
 */
function speichern(optionen = {}) {
  // Fehler des Vorgängers dürfen die Kette nicht abreißen lassen, an den
  // eigenen Aufrufer aber sehr wohl durchgereicht werden.
  const dieser = schreibvorgang.catch(() => {}).then(() => dateiSchreiben(optionen));
  schreibvorgang = dieser.catch(() => {});
  return dieser;
}

async function dateiSchreiben({ neuerOrt = false } = {}) {
  if (!datei) return false;
  // Beispieldaten bleiben im Arbeitsspeicher -- sie sollen nie als Datei
  // herumliegen und schon gar nicht eine echte Klassendatei überschreiben.
  if (datei.beispiel) {
    gesichertZeigen(true);
    return true;
  }
  // Was jetzt offen ist, steckt gleich in den Bytes. Während des Schreibens
  // kann weitergetippt werden -- das darf hinterher nicht als gesichert gelten.
  const standVorher = offeneAenderungen;
  const bytes = await verschluesseln(datei, tresor);

  const weg = await speicher.schreiben(bytes, { name: `${grundname()}.gradu`, neuerOrt });
  if (weg === 'abgebrochen') {
    gesichertZeigen(false); // Zähler bleibt stehen, nichts wurde geschrieben
    return false;
  }

  gesichertFertig(standVorher);
  return true;
}

/** Nach erfolgreichem Schreiben: nur abziehen, was auch in der Datei gelandet ist. */
function gesichertFertig(standVorher) {
  offeneAenderungen = Math.max(0, offeneAenderungen - standVorher);
  gesichertZeigen(offeneAenderungen === 0);
}

let sicherungLaeuft = null;
let offeneAenderungen = 0;

/**
 * Schreibt speichern() ohne Rückfrage in die Arbeitsdatei?
 *
 * Nur dann darf automatisch gesichert werden. Kann der Speicher nicht direkt
 * zurückschreiben, fällt er auf einen Download zurück -- bei 0,8 s Taktung
 * entstünde dann pro Änderung eine neue Datei. Ein Klassendurchgang
 * (14 Kinder x 5 Zeilen) hinterließe rund 70 Stück
 * „Klasse-8b-2026-27 (37).gradu" im Downloads-Ordner, und welche davon die
 * aktuelle ist, wüsste niemand mehr. Betrifft Safari immer und Chrome dann,
 * wenn der Speicherort-Dialog abgebrochen wurde.
 *
 * Beispieldaten zählen mit: dort steigt speichern() sofort aus, es entsteht
 * also ohnehin keine Datei.
 */
function schreibtStillZurueck() {
  return !!datei?.beispiel || speicher.schreibtStillZurueck;
}

/** Sammelt schnelle Änderungen und speichert gebündelt. */
function merken() {
  offeneAenderungen++;
  gesichertZeigen(false);
  clearTimeout(sicherungLaeuft);
  if (!schreibtStillZurueck()) return; // dort sichert der Knopf in der Leiste
  sicherungLaeuft = setTimeout(() => speichern(), 800);
}

/**
 * Zeigt den Speicherzustand -- als stille Anzeige, wo automatisch gesichert
 * wird, sonst als Knopf mit der Zahl der offenen Änderungen.
 */
function gesichertZeigen(fertig) {
  if (fertig) offeneAenderungen = 0;

  const feld = $('#gesichert');
  const knopf = $('#jetzt-sichern');
  const vonHand = !schreibtStillZurueck();

  feld.hidden = vonHand;
  knopf.hidden = !vonHand;

  if (vonHand) {
    knopf.textContent = offeneAenderungen
      ? `Sichern (${offeneAenderungen})`
      : 'gesichert';
    knopf.disabled = !offeneAenderungen;
  } else {
    feld.textContent = fertig ? 'gesichert' : 'ändert …';
    feld.dataset.zustand = fertig ? 'fertig' : 'offen';
  }
}

// ---------------------------------------------------------------- Datei-Bereich

function dateiVerdrahten() {
  // Sichern von Hand. Der Klick ist eine echte Nutzergeste -- deshalb darf
  // speichern() hier auch den Speicherort erfragen, wenn noch keiner feststeht.
  // Klappt das, wird ab dann wieder automatisch gesichert.
  $('#jetzt-sichern').addEventListener('click', async () => {
    const knopf = $('#jetzt-sichern');
    knopf.disabled = true;
    knopf.textContent = 'sichert …';
    clearTimeout(sicherungLaeuft);
    await speichern();
    gesichertZeigen(offeneAenderungen === 0);
  });

  // Bewusst ohne den gemerkten Griff: die Kopie soll woanders liegen,
  // die Arbeitsdatei bleibt, wo sie ist.
  $('#datei-kopie').addEventListener('click', async () => {
    if (!datei || datei.beispiel) return;
    const bytes = await verschluesseln(datei, tresor);
    const weg = await speicher.kopieAblegen(bytes, `${grundname()}-${heuteKurz()}.gradu`);
    if (weg === 'abgebrochen') return;
    meldungKurz('#datei-kopie', weg === 'datei' ? 'Gesichert ✓' : 'Datei heruntergeladen ✓');
  });

  $('#datei-schliessen').addEventListener('click', async () => {
    clearTimeout(sicherungLaeuft);
    if (!datei.beispiel && !(await speichern())) return;
    location.reload();
  });

  $('#passwort-neu').addEventListener('input', (e) => {
    const g = passphraseGuete(e.target.value);
    $('#passwort-guete').textContent = e.target.value ? g.text : '';
    $('#passwort-guete').dataset.stufe = g.stufe;
  });
  $('#formular-passwort').addEventListener('submit', (e) => {
    e.preventDefault();
    passwortWechseln();
  });

  $('#abschluss-starten').addEventListener('click', schuljahrAbschliessen);
  sicherungVerdrahten();
}

/**
 * Rohdaten des Schuljahres löschen (KONZEPT 11.3). Die Rückfrage nennt beides:
 * was verschwindet und was bleibt -- „Löschen" allein sagt nicht, dass die
 * Stufenhistorie erhalten bleibt, und genau das ist hier der Punkt.
 */
async function schuljahrAbschliessen() {
  if (!datei || datei.beispiel) return;

  const bilanz = kd.abschlussBilanz(datei);
  const auchTexte = $('#abschluss-texte').checked;

  if (!bilanz.einschaetzungen && !(auchTexte && bilanz.texte)) {
    alert('Es sind keine Rohdaten mehr da, die gelöscht werden könnten.');
    return;
  }

  const weg = [anzahl(bilanz.einschaetzungen, 'Einschätzung', 'Einschätzungen')];
  if (bilanz.belege) weg.push(anzahl(bilanz.belege, 'Belegsatz', 'Belegsätze') + ' der Kinder');
  if (auchTexte && bilanz.texte) {
    weg.push(`die Freitexte aus ${anzahl(bilanz.texte, 'Coaching-Gespräch', 'Coaching-Gesprächen')}`);
  }

  const bleibt = [`die ${datei.lernende.length} Kinder mit ihrer aktuellen Lernstufe`];
  if (bilanz.coachings) {
    bleibt.push(
      `der Verlauf aus ${anzahl(bilanz.coachings, 'Coaching-Gespräch', 'Coaching-Gesprächen')} ` +
        `(Datum, Entscheidung, von welcher auf welche Stufe)` +
        (auchTexte ? '' : ' einschließlich der Freitexte')
    );
  }

  const frage =
    `Rohdaten der Klasse ${datei.klasse} löschen?\n\n` +
    `Weg sind: ${aufzaehlung(weg)}.\n\n` +
    `Es bleiben: ${aufzaehlung(bleibt)}.\n\n` +
    'Das lässt sich nicht rückgängig machen.';

  if (!confirm(frage)) return;

  const ergebnis = kd.rohdatenLoeschen(datei, { texte: auchTexte });
  zeitraumWahl = null;
  stufenkonflikte = [];
  offeneImporte = [];
  coachingKind = null;

  merken();
  await speichern();
  allesZeichnen();
  alert(
    `Gelöscht: ${anzahl(ergebnis.einschaetzungen, 'Einschätzung', 'Einschätzungen')}` +
      (ergebnis.texteGeloescht ? ' und die Freitexte der Gespräche' : '') +
      '.\nDer Verlauf der Lernstufen ist erhalten.'
  );
}

function abschlussZeichnen() {
  const bilanz = kd.abschlussBilanz(datei);
  const beispiel = !!datei.beispiel;

  $('#abschluss-form').hidden = beispiel;
  $('#abschluss-gesperrt').hidden = !beispiel;
  if (beispiel) {
    $('#abschluss-bilanz').innerHTML = '';
    return;
  }

  $('#abschluss-bilanz').innerHTML = `
    <p class="meldung ${bilanz.einschaetzungen ? 'warnung' : 'offen'}">
      <strong>Zum Löschen vorgemerkt:</strong>
      ${anzahl(bilanz.einschaetzungen, 'Einschätzung', 'Einschätzungen')}${
        bilanz.belege ? `, davon ${bilanz.belege} mit Belegsatz` : ''}
      · Freitexte in ${bilanz.texte} von
      ${anzahl(bilanz.coachings, 'Gespräch', 'Gesprächen')}</p>
    <p class="meldung gut"><strong>Bleibt erhalten:</strong>
      ${anzahl(datei.lernende.length, 'Kind', 'Kinder')} mit ihrer Lernstufe · der Verlauf aus
      ${anzahl(bilanz.coachings, 'Gespräch', 'Gesprächen')}</p>
    ${datei.abschluss
      ? `<p class="meldung offen">Zuletzt abgeschlossen am ${datumLang(datei.abschluss.datum)}${
          datei.abschluss.texteGeloescht ? ' (mit Freitexten)' : ' (ohne Freitexte)'}</p>`
      : ''}`;
}

/**
 * Setzt ein neues Passwort. Technisch heißt das: neues Salz, neuer Schlüssel,
 * Datei einmal komplett neu geschrieben -- die alten Bytes lassen sich nicht
 * nachträglich umschlüsseln.
 *
 * Das alte Passwort wird **nicht** abgefragt. Es steht nach dem Öffnen nirgends
 * mehr (der Schlüssel im Tresor ist `extractable: false`), es ließe sich also
 * nur durch einen zweiten Entschlüsselungsversuch auf die Datei prüfen. Der
 * Aufwand lohnt nicht: Wer hier steht, hat die Klasse bereits offen -- ein
 * neues Passwort verschafft ihm keinen Zugang, den er nicht schon hätte.
 *
 * Der neue Tresor gilt erst, wenn das Schreiben geklappt hat. Sonst läge in der
 * Datei noch das alte Passwort, während die Anwendung schon das neue annimmt --
 * und beim nächsten Öffnen käme „Passwort falsch".
 */
async function passwortWechseln() {
  const neu = $('#passwort-neu').value;
  const wdh = $('#passwort-wdh').value;
  const fehler = $('#passwort-fehler');
  const erfolg = $('#passwort-erfolg');
  const knopf = $('#formular-passwort button');

  erfolg.hidden = true;
  const beanstanden = (text, feld) => {
    fehler.textContent = text;
    fehler.hidden = false;
    feld.focus();
  };

  if (datei.beispiel) {
    return beanstanden('In der Beispielklasse gibt es keine Datei und damit kein Passwort.', $('#passwort-neu'));
  }
  if (neu.length < 8) return beanstanden('Das Passwort braucht mindestens 8 Zeichen.', $('#passwort-neu'));
  if (neu !== wdh) return beanstanden('Die beiden Eingaben sind nicht gleich.', $('#passwort-wdh'));
  fehler.hidden = true;

  const alter = tresor;
  knopf.disabled = true;
  knopf.textContent = 'ändert …';

  try {
    // Die anstehende Sammelsicherung darf nicht dazwischenschreiben
    clearTimeout(sicherungLaeuft);
    tresor = await tresorAnlegen(neu);
    if (!(await speichern())) throw new Error('abgebrochen');
  } catch {
    tresor = alter; // in der Datei steht weiterhin das alte Passwort
    beanstanden(
      'Die Datei wurde nicht geschrieben – es gilt weiterhin das bisherige Passwort.',
      $('#passwort-neu')
    );
    knopf.disabled = false;
    knopf.textContent = 'Passwort ändern';
    return;
  }

  $('#passwort-neu').value = '';
  $('#passwort-wdh').value = '';
  $('#passwort-guete').textContent = '';
  knopf.disabled = false;
  knopf.textContent = 'Passwort ändern';

  erfolg.textContent = schreibtStillZurueck()
    ? 'Passwort geändert. Beim nächsten Öffnen der Klassendatei gilt das neue.'
    : 'Passwort geändert – die neu abgelegte Datei ist damit verschlüsselt. ' +
      'Speichere sie über die bisherige, sonst gilt weiter das alte Passwort.';
  erfolg.hidden = false;
}

// ---------------------------------------------------------------- Wochensicherung

/**
 * „Wöchentlich eine datierte Kopie neben der Arbeitsdatei, die letzten ~10
 * behalten" (KONZEPT Abschnitt 6). Sonst hängt ein ganzes Schuljahr an
 * Backup-Disziplin.
 *
 * Warum ein eigener Ordner: Ein Dateigriff kennt sein Verzeichnis nicht, die
 * Anwendung kann also nicht von sich aus „daneben" schreiben. Der Ordner wird
 * einmal gewählt und dann gemerkt -- ab da läuft es ohne Zutun.
 *
 * Warum das kein zweites Datenschutzproblem ist: Die Kopien sind dieselben
 * verschlüsselten Bytes wie die Arbeitsdatei. Wo sie liegen, ist deshalb
 * gleichgültig -- genau das ist die Zusage aus KONZEPT Abschnitt 9.
 */
function sicherungFaellig() {
  if (!datei?.letzteSicherung) return true;
  const her = (Date.now() - new Date(`${datei.letzteSicherung}T00:00:00`)) / 86_400_000;
  return her >= SICHERUNG_TAGE;
}

/**
 * Läuft nach dem Öffnen einer Klasse -- also aus der Nutzergeste heraus, mit
 * der das Passwort abgeschickt wurde. Nur dort darf nach der Berechtigung für
 * den gemerkten Ordner gefragt werden.
 */
async function wochensicherungPruefen() {
  if (!datei || datei.beispiel || !sicherungFaellig()) return;
  await wochensicherungSchreiben();
}

/**
 * Angefasst wird im Ordner ausschließlich, was zum Namensmuster **dieser**
 * Klasse passt -- Sicherungen anderer Klassen und fremde Dateien bleiben
 * unberührt. Der Klassenname geht durch `regexSicher()`, weil „8b (Beispiel)"
 * Klammern enthält.
 */
async function wochensicherungSchreiben() {
  const bytes = await verschluesseln(datei, tresor);
  const name = await speicher.inOrdnerAblegen(bytes, `${grundname()}_${heuteKurz()}.gradu`, {
    muster: new RegExp(`^${regexSicher(grundname())}_\\d{4}-\\d{2}-\\d{2}\\.gradu$`),
    behalten: SICHERUNGEN_BEHALTEN,
  });
  if (!name) return null;

  datei.letzteSicherung = heuteKurz();
  merken();
  return name;
}

function grundname() {
  return `Klasse-${datei.klasse}-${datei.schuljahr.replace('/', '-')}`;
}

/** Klassennamen wie „8b (Beispiel)" enthalten Zeichen mit Regex-Bedeutung. */
function regexSicher(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sicherungVerdrahten() {
  $('#sicherung-ordner').addEventListener('click', async () => {
    if (!(await speicher.ordnerWaehlen())) return; // abgebrochen
    await sicherungZeichnen();
    meldungKurz('#sicherung-ordner', 'Ordner gemerkt ✓');
  });

  $('#sicherung-jetzt').addEventListener('click', async () => {
    const name = await wochensicherungSchreiben();
    await sicherungZeichnen();
    meldungKurz('#sicherung-jetzt', name ? `${name} ✓` : 'Kein Zugriff');
  });

  $('#sicherung-vergessen').addEventListener('click', async () => {
    await speicher.ordnerVergessen();
    await sicherungZeichnen();
  });
}

async function sicherungZeichnen() {
  const lage = $('#sicherung-lage');
  const knoepfe = $('#sicherung-knoepfe');
  const liste = $('#sicherung-liste');
  liste.innerHTML = '';

  if (!speicher.kannOrdner) {
    lage.textContent =
      'Dieser Browser kann keinen Ordner freigeben – automatische Wochensicherungen gibt es ' +
      'deshalb nur in Chrome. Nutze so lange „Klassendaten lokal sichern" weiter oben.';
    knoepfe.hidden = true;
    return;
  }
  if (datei?.beispiel) {
    lage.textContent = 'In der Beispielklasse gibt es nichts zu sichern.';
    knoepfe.hidden = true;
    return;
  }

  knoepfe.hidden = false;
  const ordner = await speicher.ordnerName();

  if (!ordner) {
    lage.textContent =
      `Noch kein Sicherungsordner gewählt. Ist einer eingerichtet, legt die Anwendung dort beim ` +
      `Öffnen automatisch alle ${SICHERUNG_TAGE} Tage eine datierte Kopie ab und behält die ` +
      `letzten ${SICHERUNGEN_BEHALTEN}.`;
    $('#sicherung-jetzt').hidden = true;
    $('#sicherung-vergessen').hidden = true;
    return;
  }

  $('#sicherung-jetzt').hidden = false;
  $('#sicherung-vergessen').hidden = false;
  lage.textContent =
    `Sicherungsordner: „${ordner.name || 'gewählter Ordner'}“ · ` +
    (datei?.letzteSicherung
      ? `zuletzt gesichert am ${datumLang(datei.letzteSicherung)}`
      : 'noch keine Kopie abgelegt') +
    `. Es werden die letzten ${SICHERUNGEN_BEHALTEN} behalten.`;

  // Der Speicher liefert nur, wenn der Zugriff ohnehin schon steht -- hier ist
  // keine Nutzergeste im Spiel, es darf also nicht nachgefragt werden.
  const namen = await speicher.ordnerInhalt();
  if (!namen) return;
  liste.innerHTML = namen
    .reverse()
    .slice(0, SICHERUNGEN_BEHALTEN)
    .map((n) => `<li>${escapen(n)}</li>`)
    .join('');
}

function heuteKurz() {
  return new Date().toISOString().slice(0, 10);
}

/** Kurze Rückmeldung direkt am Knopf -- verlässlicher als eine Meldung irgendwo. */
function meldungKurz(auswahl, text) {
  const knopf = $(auswahl);
  const vorher = knopf.textContent;
  knopf.textContent = text;
  knopf.disabled = true;
  setTimeout(() => {
    knopf.textContent = vorher;
    knopf.disabled = false;
  }, 1600);
}

function dateiAngabenZeichnen() {
  const zeitraum = aktuellerZeitraum();
  const angaben = [
    ['Klasse', `${datei.klasse}, Schuljahr ${datei.schuljahr}`],
    ['Kinder', `${datei.lernende.length}`],
    ['Zeitraum', `${zeitraum} (Start ${datumLang(datei.zyklus.start)})`],
    ['Einschätzungen', `${datei.einschaetzungen.length}`],
    ['Coaching-Gespräche', `${datei.coachings.length}`],
    ['Zuletzt geändert', datei.geaendert ? new Date(datei.geaendert).toLocaleString('de-DE') : '–'],
    ['Ablage', datei.beispiel ? 'Beispieldaten – nur im Arbeitsspeicher'
      : speicher.name ?? 'wird beim Sichern abgefragt'],
  ];

  $('#datei-angaben').innerHTML = angaben
    .map(([k, w]) => `<div><dt>${k}</dt><dd>${escapen(String(w))}</dd></div>`)
    .join('');

  // Im Beispielmodus wäre Sichern irreführend -- und ein Passwort gibt es dort
  // gar nicht, weil keine Datei entsteht
  $('#datei-kopie').disabled = !!datei.beispiel;
  $('#formular-passwort').hidden = !!datei.beispiel;
  $('#passwort-hinweis').hidden = !!datei.beispiel;
  $('#passwort-gesperrt').hidden = !datei.beispiel;

  katalogstandZeichnen();

  $('#datei-modus').textContent = schreibtStillZurueck()
    ? 'Änderungen werden automatisch gesichert, solange diese Klasse geöffnet ist. ' +
      'Lege am Ende der Bearbeitung trotzdem eine eigene Sicherung ab – dann liegen die ' +
      'Klassendaten unabhängig von Browser und Gerät bei dir.'
    : 'Dieser Browser kann nicht direkt in die Klassendatei schreiben, deshalb wird hier ' +
      'nicht automatisch gesichert. Oben in der Leiste steht, wie viele Änderungen offen ' +
      'sind – ein Klick darauf legt sie als Datei ab, die du über die bisherige speicherst. ' +
      'In Chrome entfällt dieser Schritt.';
}

// ---------------------------------------------------------------- Anwendung

function katalogstandZeichnen() {
  const feld = $('#katalog-warnung');
  feld.hidden = katalogstand === 'aktuell';
  if (feld.hidden) return;

  const meine = escapen(String(datei.katalogVersion ?? '?'));
  const heute = escapen(String(katalogAktuell.version));

  feld.innerHTML =
    katalogstand === 'alt'
      ? `<strong>Diese Klasse läuft auf Fassung ${meine} des Kriterienkatalogs</strong>, ` +
        `ausgeliefert wird inzwischen Fassung ${heute}. Angezeigt werden die Texte aus ` +
        `Fassung ${meine} – so, wie sie beim Ankreuzen danebenstanden. ` +
        `<button type="button" class="knopf-klein" id="katalog-umstellen">` +
        `Auf Fassung ${heute} umstellen</button>`
      : `<strong>Fassung ${meine} des Kriterienkatalogs ist nicht archiviert.</strong> ` +
        `Diese Klassendatei verweist darauf, gefunden wurde sie nicht – angezeigt werden ` +
        `deshalb die Texte der heutigen Fassung ${heute}. Wer die alte Fassung noch hat, ` +
        `legt sie als <code>gemeinsam/kataloge/katalog-${meine}.json</code> ab.`;

  $('#katalog-umstellen')?.addEventListener('click', katalogUmstellen);
}

/** Der gerade betrachtete Zeitraum -- gewählt oder aus dem Datum. */
function aktuellerZeitraum() {
  return zeitraumWahl ?? kd.zeitraumFuer(datei);
}

function zeitraumwahlZeichnen() {
  const heute = kd.zeitraumFuer(datei);
  // so weit, wie Daten reichen -- mindestens bis heute, plus eine Reserve
  const hoechster = Math.max(heute, ...datei.einschaetzungen.map((e) => e.zeitraum), 1);
  const auswahl = $('#leiste-zeitraum');

  auswahl.innerHTML = Array.from({ length: hoechster + 1 }, (_, i) => i + 1)
    .map((z) => {
      const merkmal = z === heute ? ' · heute' : '';
      const coaching = kd.coachingFaellig(datei, z) ? ' · Coaching' : '';
      return `<option value="${z}">${z}${merkmal}${coaching}</option>`;
    })
    .join('');

  auswahl.value = String(aktuellerZeitraum());
  $('#zeitraum-heute').hidden = aktuellerZeitraum() === heute;
}

function anwendungZeigen() {
  $('#einstieg').hidden = true;
  $('#anwendung').hidden = false;
  $('#beispielleiste').hidden = !datei.beispiel;
  $('#kopf-klasse').textContent = datei.klasse;
  $('#kopf-schuljahr').textContent = datei.schuljahr;
  gesichertZeigen(offeneAenderungen === 0); // legt Anzeige oder Knopf fest
  allesZeichnen();
}

/**
 * Text der Statuszeile. Beide Angaben stehen nebeneinander -- vorher verdeckte
 * „Coaching-Gespräche stehen an" die Zahl der fehlenden Selbsteinschätzungen,
 * und ausgerechnet im Coaching-Zeitraum ist sie am wichtigsten.
 */
function leistenstatus(zeitraum) {
  if (!datei.lernende.length) return 'noch keine Kinder in der Liste';

  const fehlen = kd.fehlendeSelbsteinschaetzungen(datei, zeitraum).length;
  const teile = [
    fehlen === 0 ? 'alle Selbsteinschätzungen da'
      : fehlen === 1 ? '1 Selbsteinschätzung fehlt noch'
        : `${fehlen} Selbsteinschätzungen fehlen noch`,
  ];
  if (kd.coachingFaellig(datei, zeitraum)) teile.push('Coaching-Gespräche stehen an');
  return teile.join(' · ');
}

function allesZeichnen() {
  zeitraumwahlZeichnen();
  $('#leiste-status').textContent = leistenstatus(aktuellerZeitraum());

  klassenlisteZeichnen();
  fremdZeichnen();
  dateiAngabenZeichnen();
  abschlussZeichnen();
  sicherungZeichnen();
}

function klassenlisteZeichnen() {
  const ziel = $('#klassenliste');
  const zeitraum = aktuellerZeitraum();

  if (!datei.lernende.length) {
    ziel.innerHTML =
      '<p class="leer"><img class="leer-bild" src="../bilder/leer-klasse.png" alt="" ' +
      'width="512" height="341">Noch keine Kinder angelegt.</p>';
    return;
  }

  ziel.innerHTML = datei.lernende
    .map((kind) => {
      const s = stufe(katalog, kind.stufe);
      const zeilenIds = bewertungszeilen(katalog, kind.stufe).map((r) => r.id);

      const zeitraeume = kd.zeitraeumeDesBlocks(datei, zeitraum).map((z) => {
        const selbst = !!kd.einschaetzung(datei, kind.id, z, 'selbst');
        const fremd = kd.erfassungsstand(datei, kind.id, z, 'fremd', zeilenIds);

        // „beide“ erst, wenn die Fremdeinschätzung auch vollständig ist
        const art =
          selbst && fremd.vollstaendig ? 'beide' : selbst || fremd.erfasst ? 'halb' : 'leer';

        const hinweis = [
          `Zeitraum ${z}`,
          selbst ? 'Selbsteinschätzung da' : 'Selbsteinschätzung fehlt',
          `Fremdeinschätzung ${fremd.erfasst} von ${fremd.gesamt}`,
        ].join(' · ');

        return { art, hinweis };
      });

      const punkte = zeitraeume
        .map((p) => `<span class="punkt ${p.art}" title="${p.hinweis}"></span>`)
        .join('');

      // Ein echtes <button>, kein <article role="button">: Der Accessibility-Baum
      // las die Karte sonst als „Schaltfläche" ohne zugänglichen Namen vor.
      // Tastaturbedienung kommt jetzt vom Element selbst, und `aria-label` sagt
      // in einem Satz, was die Karte zeigt -- die Punkte allein sind stumm.
      const vollstaendig = zeitraeume.filter((p) => p.art === 'beide').length;
      const beschriftung =
        `${kind.name}, ${s.name}, ` +
        `${vollstaendig} von ${zeitraeume.length} Zeiträumen vollständig`;

      return `
        <button type="button" class="kind" style="--farbe:${s.farbe}"
                data-kind="${kind.id}" aria-label="${escapen(beschriftung)}">
          <span class="kind-name" aria-hidden="true">${escapen(kind.name)}</span>
          <span class="kind-stufe" aria-hidden="true">${s.name}</span>
          <span class="kind-punkte" aria-hidden="true">${punkte}</span>
        </button>`;
    })
    .join('');
}

// ---------------------------------------------------------------- Verlauf eines Kindes

function kindZeigen(schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) return;

  for (const a of document.querySelectorAll('.ansicht')) a.hidden = a.id !== 'ansicht-kind';
  for (const k of document.querySelectorAll('.navigation button')) k.classList.remove('aktiv');
  $('#kopf-titel').textContent = 'Verlauf';

  const s = stufe(katalog, kind.stufe);
  $('#kind-titel').textContent = kind.name;
  $('#kind-unter').textContent = `${s.name} seit ${datumLang(kind.seit)}`;

  $('#kind-coaching-starten').hidden = false;
  $('#kind-coaching-starten').textContent = 'Coaching-Gespräch führen';
  $('#kind-coaching-starten').onclick = () => coachingZeigen(kind.id);

  $('#kind-auskunft').onclick = () => auskunftZeigen(kind.id);
  $('#kind-umbenennen').onclick = () => kindUmbenennen(kind.id);
  $('#kind-entfernen').onclick = () => kindEntfernen(kind.id);

  bandZeichnen(kind);
  zeitraumtabelleZeichnen(kind);
  coachingsZeichnen(kind);
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- Auskunft (Art. 15 DSGVO)

/**
 * Alles, was über ein Kind gespeichert ist, auf einem Blatt -- zum Ausdrucken
 * und Aushändigen.
 *
 * Bewusst **kein Dateidownload**: Eine Textdatei mit Verhaltensdaten läge
 * unverschlüsselt im Downloads-Ordner und würde auf einem Mac mit
 * synchronisiertem Schreibtisch unbemerkt in die iCloud wandern -- genau die
 * Falle aus KONZEPT Abschnitt 9. Für Ausdrucke macht das Konzept die Ausnahme
 * („die gehören gedruckt und nicht abgelegt"), für Dateien nicht.
 */
function auskunftZeigen(schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  if (!kind) return;

  for (const a of document.querySelectorAll('.ansicht')) a.hidden = a.id !== 'ansicht-auskunft';
  for (const k of document.querySelectorAll('.navigation button')) k.classList.remove('aktiv');
  $('#kopf-titel').textContent = 'Auskunft';
  $('#auskunft-zurueck').onclick = () => kindZeigen(schuelerId);

  $('#auskunft-blatt').innerHTML = auskunftBauen(kind);
  window.scrollTo({ top: 0 });
}

function auskunftBauen(kind) {
  const eigene = (quelle) =>
    datei.einschaetzungen
      .filter((e) => e.schuelerId === kind.id && e.quelle === quelle)
      .sort((a, b) => a.zeitraum - b.zeitraum);

  const selbst = eigene('selbst');
  const fremd = eigene('fremd');
  const gespraeche = kd.coachingsVon(datei, kind.id).slice().reverse();

  return `
    <div class="auskunft">
      <h1>Auskunft über gespeicherte Daten</h1>
      <p class="auskunft-unter">nach Artikel 15 der Datenschutz-Grundverordnung ·
        Graduierungssystem der Mittelschule Rednitzhembach</p>

      <dl class="auskunft-kopf">
        <div><dt>Person</dt><dd>${escapen(kind.name)}</dd></div>
        <div><dt>Klasse</dt><dd>${escapen(datei.klasse)}, Schuljahr ${escapen(datei.schuljahr)}</dd></div>
        <div><dt>Aktuelle Lernstufe</dt>
          <dd>${stufe(katalog, kind.stufe).name} (seit ${datumLang(kind.seit)})</dd></div>
        <div><dt>Auskunft erstellt am</dt><dd>${datumLang(heuteKurz())}</dd></div>
      </dl>

      <h2>1 · Verlauf der Lernstufen</h2>
      ${auskunftVerlauf(kind)}

      <h2>2 · Selbsteinschätzungen des Kindes (${selbst.length})</h2>
      ${auskunftEinschaetzungen(selbst, kind, true)}

      <h2>3 · Einschätzungen der Klassenlehrkraft (${fremd.length})</h2>
      ${auskunftEinschaetzungen(fremd, kind, false)}

      <h2>4 · Coaching-Gespräche (${gespraeche.length})</h2>
      ${auskunftGespraeche(gespraeche)}

      <h2>5 · Herkunft, Zweck und Aufbewahrung</h2>
      <ul class="auskunft-erlaeuterung">
        <li><strong>Woher die Daten stammen:</strong> Die Selbsteinschätzungen hat das Kind
          selbst auf seinem Gerät ausgefüllt und abgeschickt. Die Einschätzungen der Lehrkraft
          und die Gesprächsnotizen stammen von der Klassenlehrkraft.</li>
        <li><strong>Wozu sie verarbeitet werden:</strong> ausschließlich zur Vorbereitung und
          Dokumentation der Coaching-Gespräche im Graduierungssystem.</li>
        <li><strong>Wer sie sieht:</strong> die Klassenlehrkraft. Es gibt keine Übermittlung an
          Dritte, keinen Server und keine Cloud.</li>
        <li><strong>Wo sie liegen:</strong> in einer verschlüsselten Datei auf dem Gerät der
          Klassenlehrkraft.</li>
        <li><strong>Wie lange:</strong> Die Einschätzungen werden zum Schuljahresende gelöscht;
          erhalten bleibt der Verlauf der Lernstufen.</li>
        <li><strong>Rechte:</strong> Berichtigung, Löschung, Einschränkung der Verarbeitung und
          Beschwerde bei der Aufsichtsbehörde – zu richten an die Schule.</li>
      </ul>
      ${datei.abschluss
        ? `<p class="auskunft-fussnote">Hinweis: Am ${datumLang(datei.abschluss.datum)} wurden die
             Rohdaten dieses Schuljahres gelöscht${datei.abschluss.texteGeloescht
               ? ', einschließlich der Freitexte aus den Gesprächen' : ''}.
             Diese Auskunft zeigt, was danach noch vorhanden ist.</p>`
        : ''}
    </div>`;
}

function auskunftVerlauf(kind) {
  const verlauf = kd.stufenverlauf(datei, kind.id);
  const wort = { hoch: 'Hochstufung', gleich: 'Stufe gehalten', runter: 'Rückstufung', Start: 'zu Beginn' };

  return `<table class="auskunft-tabelle">
    <thead><tr><th>Ab</th><th>Lernstufe</th><th>Anlass</th></tr></thead>
    <tbody>${verlauf
      .map(
        (s) => `<tr>
          <td>${s.ab ? datumLang(s.ab) : 'Schuljahresbeginn'}</td>
          <td>${stufe(katalog, s.stufe).name}</td>
          <td>${wort[s.anlass] ?? escapen(s.anlass)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function auskunftEinschaetzungen(liste, kind, mitBeleg) {
  if (!liste.length) return '<p class="auskunft-leer">Keine gespeichert.</p>';
  const wort = Object.fromEntries(katalog.skala.map((s) => [s.id, s.text]));

  return liste
    .map((e) => {
      // Gegen die damals gültige Stufe auflösen, nicht gegen die heutige
      const damals = e.stufe ?? kind.stufe;
      const zeilen = mitBeleg
        ? kriterienDerStufe(katalog, damals).map((k) => [k.id, k.text])
        : bewertungszeilen(katalog, damals).map((z) => [z.id, z.text]);

      const eintraege = zeilen
        .filter(([id]) => e.bewertungen?.[id])
        .map(([id, text]) => `<li>${escapen(text)} – <b>${wort[e.bewertungen[id]]}</b></li>`)
        .join('');

      const belegKriterium = katalog.kriterien.find((k) => k.id === e.beleg?.kriteriumId);

      return `<div class="auskunft-block">
        <p class="auskunft-block-kopf">Zeitraum ${e.zeitraum} ·
          ${stufe(katalog, damals).name}${e.erstellt ? ` · erfasst am ${datumLang(e.erstellt.slice(0, 10))}` : ''}</p>
        <ul class="auskunft-werte">${eintraege || '<li>Keine Angaben.</li>'}</ul>
        ${mitBeleg && e.beleg?.text
          ? `<p class="auskunft-beleg"><em>Eigener Satz des Kindes${
              belegKriterium ? ` zu „${escapen(belegKriterium.text)}“` : ''}:</em><br>
             „${escapen(e.beleg.text)}“</p>`
          : ''}
      </div>`;
    })
    .join('');
}

function auskunftGespraeche(gespraeche) {
  if (!gespraeche.length) return '<p class="auskunft-leer">Keins geführt.</p>';
  const wort = { hoch: 'Hochstufung', gleich: 'Stufe gehalten', runter: 'Rückstufung' };

  return gespraeche
    .map((c) => {
      const gruende = c.gruende?.length
        ? `<p><em>Angekreuzte Gründe:</em></p><ul class="auskunft-werte">${c.gruende
            .map((id) => `<li>${escapen(katalog.kriterien.find((k) => k.id === id)?.rueckstufung ?? id)}</li>`)
            .join('')}</ul>`
        : '';

      return `<div class="auskunft-block">
        <p class="auskunft-block-kopf">${datumLang(c.datum)} · ${wort[c.entscheidung]} ·
          ${stufe(katalog, c.vonStufe).name}${c.vonStufe !== c.nachStufe
            ? ` → ${stufe(katalog, c.nachStufe).name}` : ''}
          (gilt ab ${datumLang(c.gueltigAb)})</p>
        ${c.begruendung ? `<p><em>Begründung:</em> ${escapen(c.begruendung)}</p>` : ''}
        ${gruende}
        ${c.vereinbarungen ? `<p><em>Vereinbarung:</em> ${escapen(c.vereinbarungen)}</p>` : ''}
        <p class="auskunft-klein">Ausweis übergeben: ${c.ausweisUebergeben ? 'ja' : 'nein'}</p>
      </div>`;
    })
    .join('');
}

function kindUmbenennen(schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  const neu = prompt('Neuer Name:', kind.name)?.trim();
  if (!neu || neu === kind.name) return;

  try {
    kd.lernendeUmbenennen(datei, schuelerId, neu);
  } catch (fehler) {
    alert(fehler.message);
    return;
  }

  merken();
  allesZeichnen();
  kindZeigen(schuelerId);
}

/**
 * Entfernen löscht den ganzen Verlauf mit -- deshalb steht in der Rückfrage,
 * wie viel das ist. „3 Einschätzungen und 1 Gespräch" ist eine andere
 * Entscheidung als „nichts davon", und beides sieht auf dem Knopf gleich aus.
 */
function kindEntfernen(schuelerId) {
  const kind = datei.lernende.find((l) => l.id === schuelerId);
  const einschaetzungen = datei.einschaetzungen.filter((e) => e.schuelerId === schuelerId).length;
  const coachings = datei.coachings.filter((c) => c.schuelerId === schuelerId).length;

  const haengtDran = [
    einschaetzungen ? anzahl(einschaetzungen, 'Einschätzung', 'Einschätzungen') : null,
    coachings ? anzahl(coachings, 'Coaching-Gespräch', 'Coaching-Gespräche') : null,
  ].filter(Boolean);

  const frage =
    `„${kind.name}“ aus der Klassenliste entfernen?\n\n` +
    (haengtDran.length
      ? `Dabei werden auch ${aufzaehlung(haengtDran)} gelöscht.\n\n`
      : 'Es sind noch keine Einschätzungen erfasst.\n\n') +
    'Das lässt sich nicht rückgängig machen.';

  if (!confirm(frage)) return;

  const bilanz = kd.lernendeEntfernen(datei, schuelerId);
  // Ein offener Stufenkonflikt zu diesem Kind wäre jetzt ins Leere gerichtet
  stufenkonflikte = stufenkonflikte.filter((k) => k.schuelerId !== schuelerId);
  if (coachingKind?.id === schuelerId) coachingKind = null;

  merken();
  allesZeichnen();
  document.querySelector('.navigation button[data-ansicht="uebersicht"]').click();
  alert(`„${bilanz.name}“ wurde entfernt.`);
}

function aufzaehlung(teile) {
  if (teile.length === 1) return teile[0];
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`;
}

/** „1 Einschätzung" statt „1 Einschätzungen". */
function anzahl(wieviele, ein, mehrere) {
  return `${wieviele} ${wieviele === 1 ? ein : mehrere}`;
}

function bandZeichnen(kind) {
  const verlauf = kd.stufenverlauf(datei, kind.id);

  $('#kind-band').innerHTML = `<div class="band">${verlauf
    .map((schritt, i) => {
      const s = stufe(katalog, schritt.stufe);
      const pfeil =
        i === 0
          ? ''
          : `<span class="band-pfeil ${schritt.anlass}">${
              schritt.anlass === 'hoch' ? '↗' : schritt.anlass === 'runter' ? '↘' : '→'
            }</span>`;
      return `${pfeil}<span class="band-stufe" style="--farbe:${s.farbe}">
                <b>${s.name}</b>
                <small>${schritt.ab ? `ab ${datumKurz(schritt.ab)}` : 'Schuljahresbeginn'}</small>
              </span>`;
    })
    .join('')}</div>`;
}

/** Alle Zeiträume mit Selbst- und Fremdsicht nebeneinander -- Abweichungen markiert. */
function zeitraumtabelleZeichnen(kind) {
  const bisher = aktuellerZeitraum();
  const zeilen = [];

  for (let z = 1; z <= bisher; z++) {
    const selbst = kd.einschaetzung(datei, kind.id, z, 'selbst');
    const fremd = kd.einschaetzung(datei, kind.id, z, 'fremd');
    if (!selbst && !fremd) continue;

    // gegen die damals gültige Stufe auswerten, nicht gegen die heutige
    const damals = selbst?.stufe ?? fremd?.stufe ?? kind.stufe;
    const zeilenIds = bewertungszeilen(katalog, damals).map((r) => r.id);
    const kriterienIds = kriterienDerStufe(katalog, damals).map((k) => k.id);

    zeilen.push(`
      <tr>
        <th scope="row">${z}</th>
        <td>${bilanz(selbst?.bewertungen, kriterienIds)}</td>
        <td>${bilanz(fremd?.bewertungen, zeilenIds)}</td>
        <td class="beleg-spalte">${selbst?.beleg?.text ? escapen(selbst.beleg.text) : '<span class="leise">–</span>'}</td>
      </tr>`);
  }

  $('#kind-zeitraeume').innerHTML = zeilen.length
    ? `<table class="zeitraumtabelle">
         <thead><tr><th>Zeitraum</th><th>Selbst</th><th>Lehrkraft</th><th>Beleg des Kindes</th></tr></thead>
         <tbody>${zeilen.join('')}</tbody>
       </table>`
    : '<p class="leer">Noch keine Einschätzungen.</p>';
}

function bilanz(bewertungen, ids) {
  if (!bewertungen) return '<span class="leise">fehlt</span>';
  const zaehlen = (wert) => ids.filter((id) => bewertungen[id] === wert).length;
  const offen = ids.filter((id) => !bewertungen[id]).length;
  return `<span class="bilanz">
      <span class="b-gut">${zaehlen('erreicht')}</span>
      <span class="b-mittel">${zaehlen('teilweise')}</span>
      <span class="b-offen">${zaehlen('nicht')}</span>
      ${offen ? `<span class="leise">+${offen} offen</span>` : ''}
    </span>`;
}

function coachingsZeichnen(kind) {
  const gespraeche = kd.coachingsVon(datei, kind.id);

  $('#kind-coachings').innerHTML = gespraeche.length
    ? gespraeche
        .map((c) => {
          const wort = { hoch: 'Hochstufung', gleich: 'Stufe gehalten', runter: 'Rückstufung' }[c.entscheidung];
          const gruende = c.gruende?.length
            ? `<ul class="gruende">${c.gruende
                .map((id) => `<li>${escapen(katalog.kriterien.find((k) => k.id === id)?.rueckstufung ?? id)}</li>`)
                .join('')}</ul>`
            : '';
          return `
            <article class="coaching ${c.entscheidung}">
              <p class="coaching-kopf">
                <strong>${wort}</strong> · ${datumLang(c.datum)}
                ${c.vonStufe !== c.nachStufe
                  ? `· ${stufe(katalog, c.vonStufe).name} → ${stufe(katalog, c.nachStufe).name}`
                  : `· ${stufe(katalog, c.vonStufe).name}`}
                ${c.ausweisUebergeben ? '<span class="marke-klein">Ausweis übergeben</span>' : ''}
              </p>
              ${c.begruendung ? `<p class="coaching-text">${escapen(c.begruendung)}</p>` : ''}
              ${gruende}
              ${c.vereinbarungen ? `<p class="coaching-text"><em>Vereinbarung:</em> ${escapen(c.vereinbarungen)}</p>` : ''}
            </article>`;
        })
        .join('')
    : '<p class="leer"><img class="leer-bild" src="../bilder/leer-coaching.png" alt="" ' +
      'width="512" height="341">Noch kein Coaching-Gespräch festgehalten.</p>';
}

function datumLang(iso) {
  return iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '–';
}

function datumKurz(iso) {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
}

function klassenlisteVerdrahten() {
  // Nur Klick: Die Karten sind echte <button>, Enter und Leertaste lösen dort
  // von sich aus einen Klick aus. Die frühere eigene Tastaturbehandlung war
  // Ersatz für ein <article role="button"> und ist mit ihm weggefallen.
  $('#klassenliste').onclick = (e) => {
    const karte = e.target.closest('[data-kind]');
    if (karte) kindZeigen(karte.dataset.kind);
  };
}

// ---------------------------------------------------------------- Coaching-Gespräch

let coachingKind = null;

/** Kinderliste über dem Bogen -- der Einstieg ins Gespräch. */
function coachingWahlZeichnen() {
  if (!datei?.lernende.length) {
    $('#coaching-wahl').innerHTML = '';
    return;
  }
  // Bewusst nicht `.wahl-stand` wie in der Fremdeinschätzung: Dort heißt die
  // Zahl „3 von 5 erfasst" und zählt auf ein Ziel zu, hier heißt sie
  // „2 Gespräche geführt" und ist eine Vorgeschichte. Gleiche Form für
  // Ungleiches liest sich falsch -- deshalb eigene Marke, „×" statt nackter
  // Zahl, und bei null Gesprächen steht gar nichts da.
  $('#coaching-wahl').innerHTML = datei.lernende
    .map((kind) => {
      const gefuehrt = kd.coachingsVon(datei, kind.id).length;
      const marke = gefuehrt
        ? `<span class="wahl-marke">${gefuehrt}×<span class="nur-lesen"> Gespräche geführt</span></span>`
        : '';
      return `<button type="button" class="wahl ${kind.id === coachingKind?.id ? 'aktiv' : ''}"
                      data-coachingwahl="${kind.id}">${escapen(kind.name)}${marke}
              </button>`;
    })
    .join('');

  for (const knopf of $('#coaching-wahl').querySelectorAll('[data-coachingwahl]')) {
    knopf.addEventListener('click', () => coachingZeigen(knopf.dataset.coachingwahl));
  }
}

function coachingZeigen(schuelerId) {
  coachingKind = datei.lernende.find((l) => l.id === schuelerId);
  if (!coachingKind) return;

  for (const a of document.querySelectorAll('.ansicht')) a.hidden = a.id !== 'ansicht-coaching';
  document.querySelector('.navigation button[data-ansicht="coaching"]')?.classList.add('aktiv');
  for (const k of document.querySelectorAll('.navigation button')) {
    if (k.dataset.ansicht !== 'coaching') k.classList.remove('aktiv');
  }
  coachingWahlZeichnen();
  $('#coaching-zurueck').hidden = false;
  for (const id of ['#coaching-titel', '#coaching-unter']) $(id).hidden = false;

  const s = stufe(katalog, coachingKind.stufe);
  const zeitraum = aktuellerZeitraum();
  const bloecke = kd.zeitraeumeDesBlocks(datei, zeitraum);

  $('#kopf-titel').textContent = 'Coaching-Gespräch';
  $('#coaching-titel').textContent = coachingKind.name;
  $('#coaching-unter').textContent =
    `Aktuell ${s.name} · Zeiträume ${bloecke[0]} bis ${bloecke.at(-1)}`;

  $('#stufencode').hidden = true;
  $('#formular-coaching').hidden = false;
  for (const ueber of document.querySelectorAll('#ansicht-coaching h2')) ueber.hidden = false;

  bogenZeichnen(coachingKind, bloecke);
  belegeZeichnen(coachingKind, bloecke);
  entscheidungZeichnen(coachingKind);

  $('#coaching-gueltigab').value = new Date().toISOString().slice(0, 10);
  $('#coaching-begruendung').value = '';
  $('#coaching-vereinbarungen').value = '';
  $('#coaching-ausweis').checked = false;
  $('#coaching-fehler').hidden = true;
  window.scrollTo({ top: 0 });
}

/** Der Bogen: Zeilen der Stufe × Zeiträume, Selbst- und Fremdsicht nebeneinander. */
function bogenZeichnen(kind, bloecke) {
  const zeilen = bewertungszeilen(katalog, kind.stufe);
  const kurz = Object.fromEntries(katalog.skala.map((s) => [s.id, s.kurz]));

  const kopf = bloecke
    .map((z) => `<th colspan="2" class="zr">${z}</th>`)
    .join('');
  const unterkopf = bloecke.map(() => '<th class="sl">S</th><th class="sl">L</th>').join('');

  const koerper = zeilen
    .map((zeile) => {
      const kriteriumIds = zeile.enthaelt.map((k) => k.id);

      const felder = bloecke
        .map((z) => {
          const selbst = kd.einschaetzung(datei, kind.id, z, 'selbst');
          const fremd = kd.einschaetzung(datei, kind.id, z, 'fremd');

          // Selbstsicht verdichten, Fremdsicht steht schon auf der Zeile
          const sWert = zeilenwert(katalog, selbst?.bewertungen, kriteriumIds);
          const lWert = fremd?.bewertungen?.[zeile.id] ?? null;
          const uneins = sWert && lWert && sWert !== lWert;

          return `
            <td class="wert ${sWert ?? 'ohne'} ${uneins ? 'uneins' : ''}">${kurz[sWert] ?? '·'}</td>
            <td class="wert ${lWert ?? 'ohne'} ${uneins ? 'uneins' : ''}">${kurz[lWert] ?? '·'}</td>`;
        })
        .join('');

      const details =
        zeile.art === 'sammel'
          ? `<ul class="teilkriterien">${zeile.enthaelt
              .map((k) => `<li>${escapen(k.text)}</li>`)
              .join('')}</ul>`
          : '';

      return `<tr><th scope="row">${escapen(zeile.text)}${details}</th>${felder}</tr>`;
    })
    .join('');

  $('#coaching-bogen').innerHTML = `
    <table class="bogen">
      <thead>
        <tr><th rowspan="2" class="kriterienspalte">Verantwortung ${praeposition(kind.stufe)}</th>${kopf}</tr>
        <tr>${unterkopf}</tr>
      </thead>
      <tbody>${koerper}</tbody>
    </table>
    <p class="legende">${katalog.skala.map((s) => `<b>${s.kurz}</b> ${s.text}`).join(' · ')}</p>`;
}

function belegeZeichnen(kind, bloecke) {
  const belege = bloecke
    .map((z) => ({ z, e: kd.einschaetzung(datei, kind.id, z, 'selbst') }))
    .filter(({ e }) => e?.beleg?.text);

  $('#coaching-belege').innerHTML = belege.length
    ? belege
        .map(({ z, e }) => {
          const k = katalog.kriterien.find((x) => x.id === e.beleg.kriteriumId);
          return `<blockquote class="beleg-zitat">
                    <p class="beleg-zu">Zeitraum ${z}${k ? ` · ${escapen(k.text)}` : ''}</p>
                    <p>${escapen(e.beleg.text)}</p>
                  </blockquote>`;
        })
        .join('')
    : '<p class="leer">Keine Belegsätze in diesem Block.</p>';
}

function entscheidungZeichnen(kind) {
  const hoch = nachbarStufe(katalog, kind.stufe, 'hoch');
  const runter = nachbarStufe(katalog, kind.stufe, 'runter');

  const auswahl = [
    hoch && { wert: 'hoch', titel: `Hochstufung auf ${hoch.name}`,
      text: 'Die Verantwortung dieser Stufe wird erfüllt.' },
    { wert: 'gleich', titel: `${stufe(katalog, kind.stufe).name} halten`,
      text: 'Noch nicht so weit – mit Begründung.' },
    runter && { wert: 'runter', titel: `Rückstufung auf ${runter.name}`,
      text: 'Die Verantwortung wird über längere Zeit nicht erfüllt.' },
  ].filter(Boolean);

  $('#coaching-entscheidung').innerHTML = auswahl
    .map(
      (a) => `
      <label class="entscheidung-feld" data-wert="${a.wert}">
        <input type="radio" name="entscheidung" value="${a.wert}">
        <span class="entscheidung-titel">${a.titel}</span>
        <span class="entscheidung-text">${a.text}</span>
      </label>`
    )
    .join('');

  $('#coaching-entscheidung').onchange = (e) => entscheidungWechsel(e.target.value, kind);
  entscheidungWechsel(null, kind);
}

/**
 * Vereinbarungen gehören zu *jedem* Ausgang, nicht nur zur Rückstufung
 * (KONZEPT Abschnitt 2, Datenmodell in Abschnitt 7). Bei „Stufe halten" sind
 * sie sogar das eigentliche Ergebnis des Gesprächs. Das Feld steht deshalb
 * immer da -- nur die Frage darin wechselt mit der Entscheidung.
 */
const VEREINBARUNG_FRAGE = {
  hoch: 'Was nimmt sich das Kind auf der neuen Stufe vor?',
  gleich: 'Woran wird bis zum nächsten Gespräch gearbeitet?',
  runter: 'Was ist verabredet, damit es wieder aufwärtsgeht?',
};
const VEREINBARUNG_STANDARD = 'Was ist bis zum nächsten Gespräch verabredet?';

function entscheidungWechsel(wert, kind) {
  for (const feld of document.querySelectorAll('.entscheidung-feld')) {
    feld.classList.toggle('gewaehlt', feld.dataset.wert === wert);
  }

  $('#feld-gruende').hidden = wert !== 'runter';
  $('#coaching-vereinbarungen').placeholder = VEREINBARUNG_FRAGE[wert] ?? VEREINBARUNG_STANDARD;
  $('#begruendung-pflicht').hidden = wert !== 'gleich';
  $('#coaching-ausweis').closest('.haken-feld').hidden = wert === 'gleich';

  if (wert === 'runter') gruendeZeichnen(kind);
}

/** Die Ankreuzliste entsteht aus dem Katalog -- kein zweiter Bogen zu pflegen. */
function gruendeZeichnen(kind) {
  $('#coaching-gruende').innerHTML = rueckstufungsgruende(katalog, kind.stufe)
    .map(
      (g) => `
      <label class="grund">
        <input type="checkbox" value="${g.id}">
        <span>Er/sie ${escapen(g.text)}</span>
      </label>`
    )
    .join('');
}

function coachingSpeichern() {
  const gewaehlt = document.querySelector('input[name="entscheidung"]:checked');
  const meldung = $('#coaching-fehler');

  if (!gewaehlt) {
    meldung.textContent = 'Bitte wähle aus, wie das Gespräch ausgegangen ist.';
    meldung.hidden = false;
    return;
  }

  const entscheidung = gewaehlt.value;
  const begruendung = $('#coaching-begruendung').value.trim();
  const gruende = [...document.querySelectorAll('#coaching-gruende input:checked')].map((i) => i.value);

  // Der Papierbogen verlangt bei gleicher Stufe eine Begründung -- hier auch
  if (entscheidung === 'gleich' && begruendung.length < 10) {
    meldung.textContent = 'Bei gleicher Stufe gehört eine Begründung dazu.';
    meldung.hidden = false;
    $('#coaching-begruendung').focus();
    return;
  }
  if (entscheidung === 'runter' && !gruende.length) {
    meldung.textContent = 'Kreuze mindestens einen Grund für die Rückstufung an.';
    meldung.hidden = false;
    return;
  }

  meldung.hidden = true;
  kd.coachingEintragen(datei, {
    schuelerId: coachingKind.id,
    zeitraum: aktuellerZeitraum(),
    entscheidung,
    nachStufe: stufeNachEntscheidung(katalog, coachingKind.stufe, entscheidung),
    begruendung,
    vereinbarungen: $('#coaching-vereinbarungen').value,
    gruende,
    gueltigAb: $('#coaching-gueltigab').value || undefined,
    ausweisUebergeben: $('#coaching-ausweis').checked,
  });

  merken();
  allesZeichnen();
  const kind = coachingKind;
  kindZeigen(kind.id);
  stufencodeZeigen(kind);
}

// ---------------------------------------------------------------- Rückweg aufs Kindergerät

/**
 * Der QR-Rückweg aus KONZEPT Abschnitt 5. Nach dem Gespräch zeigt die Lehrkraft
 * einen Code, das Kind scannt ihn und hat die neue Stufe auf dem eigenen Gerät.
 *
 * Warum überhaupt: Bis das Kind seine Stufe umstellt, füllt es den falschen
 * Kriteriensatz aus. Der Import erkennt das seit v24 und lässt es entscheiden --
 * aber erst hier verschwindet die Ursache.
 *
 * Warum kein Kamerazugriff nötig ist: Der Code enthält schlicht die Adresse der
 * Schüleranwendung mit den Angaben im Fragment. Die iPad-Kamera erkennt ihn von
 * sich aus und öffnet die Seite -- die App muss nichts dekodieren.
 *
 * Warum ein Fragment und kein `?`-Parameter: Fragmente werden nie an den Server
 * gesendet. Dieselbe Überlegung wie beim Klassen-Link (`…/schueler/#8a`).
 */
function stufencodeZeigen(kind) {
  const kasten = $('#stufencode');
  const s = stufe(katalog, kind.stufe);

  const angaben = new URLSearchParams({ s: kind.stufe });
  const letzte = kd.coachingsVon(datei, kind.id)[0];
  if (letzte?.vereinbarungen) angaben.set('v', letzte.vereinbarungen);

  const adresse = new URL('../schueler/', location.href);
  adresse.hash = angaben.toString();

  $('#stufencode-titel').textContent = `${kind.name} · ${s.name}`;
  $('#stufencode-text').textContent =
    'Das Kind scannt den Code mit der Kamera seines iPads – dann steht die neue Stufe ' +
    'auf seinem Gerät, ohne dass es sie von Hand umstellen muss.';

  try {
    $('#stufencode-bild').innerHTML = qrAlsSvg(adresse.href, { kachel: 6 });
    $('#stufencode-adresse').textContent = adresse.href;
  } catch (fehler) {
    // Zu lange Vereinbarung: lieber ohne sie einen lesbaren Code als gar keinen
    const knapp = new URL('../schueler/', location.href);
    knapp.hash = new URLSearchParams({ s: kind.stufe }).toString();
    $('#stufencode-bild').innerHTML = qrAlsSvg(knapp.href, { kachel: 6 });
    $('#stufencode-adresse').textContent =
      `${knapp.href} — ohne die Vereinbarung: ${fehler.message}`;
  }

  kasten.hidden = false;
  kasten.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Coaching-Bereich ohne gewähltes Kind: nur die Auswahl. */
function coachingBereitZeigen() {
  coachingKind = null;
  coachingWahlZeichnen();
  $('#coaching-zurueck').hidden = true;
  for (const id of ['#coaching-titel', '#coaching-unter']) $(id).hidden = true;
  for (const id of ['#coaching-bogen', '#coaching-belege', '#coaching-entscheidung']) {
    $(id).innerHTML = '';
  }
  $('#formular-coaching').hidden = true;
  for (const ueber of document.querySelectorAll('#ansicht-coaching h2')) ueber.hidden = true;
}

/**
 * Dieselbe Vorsicht wie beim Import: Ein zweiter Eintrag zum selben Kind wäre
 * schwer zu bemerken und teuer -- `lernendeSuchen()` findet danach immer nur den
 * ersten, der zweite bekäme nie eine Selbsteinschätzung zugeordnet.
 */
function kindAnlegen() {
  const name = prompt('Name des Kindes:')?.trim();
  if (!name) return;

  const vorhanden = kd.lernendeSuchen(datei, name);
  if (vorhanden) {
    alert(`„${vorhanden.name}“ steht schon in der Klassenliste.`);
    return;
  }

  const aehnlich = kd.aehnlicheNamen(datei, name);
  if (aehnlich.length) {
    const liste = aehnlich.slice(0, 3).map((k) => `„${k.name}“`).join(', ');
    const weiter = confirm(
      `In der Klasse gibt es schon ${liste}.\n\n` +
        `„${name}“ trotzdem als weiteres Kind anlegen?`
    );
    if (!weiter) return;
  }

  kd.lernendeAnlegen(datei, name, katalog.stufen[0].id);
  merken();
  allesZeichnen();
}

// ---------------------------------------------------------------- Import

function importVerdrahten() {
  const ablage = $('#ablage');
  $('#dateien-waehlen').addEventListener('click', () => $('#datei-eingabe').click());
  $('#datei-eingabe').addEventListener('change', (e) => dateienLesen([...e.target.files]));

  for (const art of ['dragenter', 'dragover']) {
    ablage.addEventListener(art, (e) => { e.preventDefault(); ablage.classList.add('bereit'); });
  }
  for (const art of ['dragleave', 'drop']) {
    ablage.addEventListener(art, () => ablage.classList.remove('bereit'));
  }
  ablage.addEventListener('drop', (e) => {
    e.preventDefault();
    dateienLesen([...e.dataTransfer.files]);
  });
}

async function dateienLesen(dateien) {
  const ergebnisse = [];

  for (const eine of dateien) {
    try {
      const objekt = JSON.parse(await eine.text());
      const geprueft = uebergabePruefen(objekt, katalog);
      if (!geprueft.ok) {
        ergebnisse.push({ art: 'fehler', name: eine.name, grund: geprueft.fehler.join(' ') });
        continue;
      }
      ergebnisse.push(kd.selbsteinschaetzungUebernehmen(datei, geprueft.uebergabe));
    } catch {
      ergebnisse.push({ art: 'fehler', name: eine.name, grund: 'Datei ist nicht lesbar.' });
    }
  }

  merken();
  allesZeichnen();
  importErgebnisZeichnen(ergebnisse);
  $('#datei-eingabe').value = '';
}

function importErgebnisZeichnen(ergebnisse) {
  // unbekannte Namen wandern in die Warteschlange und werden dort entschieden
  for (const e of ergebnisse.filter((e) => e.art === 'unbekannt')) offeneImporte.push(e);

  // Stufenabweichungen ebenso: Sie brauchen eine Entscheidung und dürfen nicht
  // mit der Ergebnisliste des einen Imports verschwinden.
  for (const e of ergebnisse.filter((e) => e.stufeWeicht)) {
    const schon = stufenkonflikte.findIndex((k) => k.schuelerId === e.schuelerId);
    if (schon === -1) stufenkonflikte.push(e);
    else stufenkonflikte[schon] = e; // neuere Abgabe gewinnt
  }

  const erledigt = ergebnisse.filter((e) => e.art === 'neu' || e.art === 'ersetzt');
  const zeilen = ergebnisse
    .filter((e) => e.art !== 'unbekannt')
    .map((e) => {
      if (e.art === 'fehler') return meldung('fehler', e.name, e.grund);
      const zusatz = e.stufeWeicht
        ? `hat ${stufe(katalog, e.gemeldeteStufe).name} angegeben, geführt ist ${stufe(katalog, e.gefuehrteStufe).name}`
        : `Zeitraum ${e.zeitraum}${e.art === 'ersetzt' ? ' · frühere Abgabe ersetzt' : ''}`;
      return meldung(e.stufeWeicht ? 'warnung' : 'gut', e.name, zusatz);
    })
    .join('');

  $('#import-ergebnis').innerHTML =
    (offeneImporte.length ? zuordnungZeichnen() : '') +
    stufenkonflikteZeichnen() +
    (zeilen
      ? `<h2>${erledigt.length} übernommen</h2><div class="meldungen">${zeilen}</div>
         <p class="hinweis">Denk daran, den Downloads-Ordner zu leeren –
            die empfangenen Dateien sind unverschlüsselt.</p>`
      : '');

  zuordnungVerdrahten();
  stufenkonflikteVerdrahten();

  // Nach dem gewählten Zeitraum, nicht nach dem heutigen -- sonst widerspricht
  // die Liste beim Nachtragen einer alten Runde der Übersicht.
  const zeitraum = aktuellerZeitraum();
  const fehlen = kd.fehlendeSelbsteinschaetzungen(datei, zeitraum);
  $('#import-fehlliste').innerHTML = fehlen.length
    ? `<h2>Fehlt noch in Zeitraum ${zeitraum} (${fehlen.length})</h2>
       <div class="meldungen">${fehlen.map((l) => meldung('offen', l.name, '')).join('')}</div>`
    : `<p class="leer"><img class="leer-bild" src="../bilder/alles-da.png" alt=""
         width="512" height="341">Alle Selbsteinschätzungen für Zeitraum ${zeitraum} sind da.</p>`;
}

function meldung(art, name, text) {
  return `<p class="meldung ${art}"><strong>${escapen(name)}</strong>${text ? ` – ${escapen(text)}` : ''}</p>`;
}

/**
 * Namen, die es in der Klasse noch nicht gibt. Bewusst kein stilles Anlegen:
 * Die Kinder tippen ihren Namen alle zwei Wochen neu, und aus „Lea Müßig“ /
 * „Lea Müssig“ würden sonst zwei Kinder mit je halbem Verlauf.
 */
function zuordnungZeichnen() {
  const karten = offeneImporte
    .map((offen, i) => {
      const aehnlich = kd.aehnlicheNamen(datei, offen.name);
      const auswahl = aehnlich.length
        ? `<label class="zuordnen-zeile">Gehört zu
             <select data-waehlen="${i}">
               ${aehnlich.map((k) => `<option value="${k.id}">${escapen(k.name)}</option>`).join('')}
             </select>
             <button type="button" class="knopf-klein" data-zuordnen="${i}">Zuordnen</button>
           </label>`
        : '';
      return `
        <div class="zuordnen">
          <p class="zuordnen-name"><strong>${escapen(offen.name)}</strong>
            ${aehnlich.length ? '– kenne ich so noch nicht' : '– neu in der Klasse?'}</p>
          ${auswahl}
          <button type="button" class="knopf-klein" data-anlegen="${i}">Als neues Kind anlegen</button>
          <button type="button" class="knopf-klein leise" data-verwerfen="${i}">Verwerfen</button>
        </div>`;
    })
    .join('');

  // Beim Aufbau einer neuen Klasse sind alle Namen unbekannt -- dann wäre
  // Einzelklicken für 25 Kinder Unfug. Der Sammelknopf erscheint nur, wenn
  // keiner der Namen einem vorhandenen ähnelt, also nichts zu entscheiden ist.
  const alleNeu = offeneImporte.every((o) => !kd.aehnlicheNamen(datei, o.name).length);
  const sammel =
    offeneImporte.length > 1 && alleNeu
      ? `<button type="button" class="knopf-klein sammel" id="alle-anlegen">
           Alle ${offeneImporte.length} als neue Kinder anlegen</button>`
      : '';

  return `<h2>Bitte entscheiden (${offeneImporte.length})</h2>${sammel}${karten}`;
}

/**
 * Nach einem Coaching ändert sich die Stufe nur in der Klassendatei. Auf dem
 * iPad bleibt die alte stehen, bis das Kind sie selbst umstellt -- und bis
 * dahin füllt es den falschen Kriteriensatz aus. Der Import erkannte das schon
 * (`stufeWeicht`), warnte aber nur; hier lässt sich jetzt entscheiden, welche
 * der beiden Stufen gilt.
 *
 * Die Abweichung heißt nicht zwangsläufig, dass die Klassendatei recht hat:
 * Ein Kind kann sich bei der Einrichtung vertippt haben, und es kann außerhalb
 * der App aufgestiegen sein. Deshalb eine Entscheidung statt einer Automatik.
 */
function stufenkonflikteZeichnen() {
  if (!stufenkonflikte.length) return '';

  const karten = stufenkonflikte
    .map((k, i) => {
      const gemeldet = stufe(katalog, k.gemeldeteStufe);
      const gefuehrt = stufe(katalog, k.gefuehrteStufe);
      return `
        <div class="zuordnen">
          <p class="zuordnen-name"><strong>${escapen(k.name)}</strong>
            – hat ${gemeldet.name} angegeben, geführt ist ${gefuehrt.name}</p>
          <p class="hinweis">Die Abgabe aus Zeitraum ${k.zeitraum} deckt damit die
            Kriterien ${praeposition(k.gemeldeteStufe)} ab, nicht die
            ${praeposition(k.gefuehrteStufe)}.</p>
          <button type="button" class="knopf-klein" data-stufe-uebernehmen="${i}">
            ${gemeldet.name} übernehmen</button>
          <button type="button" class="knopf-klein leise" data-stufe-behalten="${i}">
            Kind hat sich vertan – ${gefuehrt.name} bleibt</button>
        </div>`;
    })
    .join('');

  return `<h2>Stufe klären (${stufenkonflikte.length})</h2>
    <p class="hinweis">Bleibt es bei der geführten Stufe, muss das Kind sie auf seinem
      Gerät im Ausweis umstellen – sonst kommt beim nächsten Mal wieder der falsche
      Kriteriensatz.</p>${karten}`;
}

function stufenkonflikteVerdrahten() {
  const bereich = $('#import-ergebnis');

  for (const knopf of bereich.querySelectorAll('[data-stufe-uebernehmen]')) {
    knopf.addEventListener('click', () => {
      const konflikt = stufenkonflikte[Number(knopf.dataset.stufeUebernehmen)];
      kd.stufeSetzen(datei, konflikt.schuelerId, konflikt.gemeldeteStufe);
      stufenkonflikte.splice(Number(knopf.dataset.stufeUebernehmen), 1);
      merken();
      allesZeichnen();
      importErgebnisZeichnen([]);
    });
  }

  // Nur die Karte verschwindet -- in der Klassendatei ändert sich nichts.
  // Meldet das Kind beim nächsten Mal erneut die alte Stufe, steht der Punkt
  // wieder da, und das ist richtig so: Dann hat es sein Gerät nicht umgestellt.
  for (const knopf of bereich.querySelectorAll('[data-stufe-behalten]')) {
    knopf.addEventListener('click', () => {
      stufenkonflikte.splice(Number(knopf.dataset.stufeBehalten), 1);
      importErgebnisZeichnen([]);
    });
  }
}

function zuordnungVerdrahten() {
  const bereich = $('#import-ergebnis');

  bereich.querySelector('#alle-anlegen')?.addEventListener('click', () => {
    for (const offen of offeneImporte) kd.uebergabeAlsNeuesKind(datei, offen.uebergabe);
    offeneImporte = [];
    merken();
    allesZeichnen();
    importErgebnisZeichnen([]);
  });

  for (const knopf of bereich.querySelectorAll('[data-anlegen]')) {
    knopf.addEventListener('click', () => {
      const offen = offeneImporte[Number(knopf.dataset.anlegen)];
      kd.uebergabeAlsNeuesKind(datei, offen.uebergabe);
      abschliessen(Number(knopf.dataset.anlegen));
    });
  }

  for (const knopf of bereich.querySelectorAll('[data-zuordnen]')) {
    knopf.addEventListener('click', () => {
      const i = Number(knopf.dataset.zuordnen);
      const gewaehlt = bereich.querySelector(`[data-waehlen="${i}"]`).value;
      kd.uebergabeZuordnen(datei, offeneImporte[i].uebergabe, gewaehlt);
      abschliessen(i);
    });
  }

  for (const knopf of bereich.querySelectorAll('[data-verwerfen]')) {
    knopf.addEventListener('click', () => abschliessen(Number(knopf.dataset.verwerfen)));
  }
}

function abschliessen(nummer) {
  offeneImporte.splice(nummer, 1);
  merken();
  allesZeichnen();
  importErgebnisZeichnen([]);
}

// ---------------------------------------------------------------- Fremdeinschätzung

// Zwei Wege durch dieselbe Aufgabe:
// „nach Kind" für die Vorbereitung eines Gesprächs (ein Kind komplett),
// „nach Kriterium" für den Klassendurchgang (ein Maßstab für alle).
let fremdModus = 'kind';
let fremdKindId = null;

function fremdVerdrahten() {
  // Legende über dem Raster. Steht fest, sobald der Katalog da ist -- die
  // Zeichen in den Erfassungsknöpfen erklären sich sonst nirgends.
  $('#fremd-legende').innerHTML = katalog.skala
    .map((s) => `<b>${s.kurz}</b> ${escapen(s.text)}`)
    .join(' · ');

  for (const knopf of document.querySelectorAll('.modus')) {
    knopf.addEventListener('click', () => {
      fremdModus = knopf.dataset.modus;
      for (const k of document.querySelectorAll('.modus')) {
        k.classList.toggle('aktiv', k === knopf);
      }
      fremdZeichnen();
    });
  }
}

function fremdZeichnen() {
  if (!datei?.lernende.length) {
    $('#fremd-wahl').innerHTML = '';
    $('#fremd-hinweis').textContent = '';
    $('#fremd-raster').innerHTML = '<p class="leer">Erst Kinder anlegen.</p>';
    return;
  }
  if (fremdModus === 'kind') fremdNachKind();
  else fremdNachKriterium();
}

/** Kind auswählen, dann alle Zeilen dieses Kindes auf einen Blick. */
function fremdNachKind() {
  const zeitraum = aktuellerZeitraum();

  if (!datei.lernende.some((l) => l.id === fremdKindId)) {
    fremdKindId = datei.lernende[0].id;
  }

  $('#fremd-hinweis').textContent =
    'Wähle ein Kind – darunter erscheinen die Kriterien seiner Stufe.';

  $('#fremd-wahl').innerHTML = datei.lernende
    .map((kind) => {
      const stand = kindstand(kind, zeitraum);
      return `<button type="button" class="wahl ${kind.id === fremdKindId ? 'aktiv' : ''} ${stand.fertig ? 'fertig' : ''}"
                      data-kindwahl="${kind.id}">${escapen(kind.name)}
                <span class="wahl-stand"><span class="nur-lesen">erfasst: </span>${standtext(stand)}</span>
              </button>`;
    })
    .join('');

  for (const knopf of $('#fremd-wahl').querySelectorAll('[data-kindwahl]')) {
    knopf.addEventListener('click', () => {
      fremdKindId = knopf.dataset.kindwahl;
      fremdZeichnen();
    });
  }

  const kind = datei.lernende.find((l) => l.id === fremdKindId);
  const s = stufe(katalog, kind.stufe);
  const bewertungen = kd.einschaetzung(datei, kind.id, zeitraum, 'fremd')?.bewertungen ?? {};

  $('#fremd-raster').innerHTML = `
    <p class="rastertitel"><strong>${escapen(kind.name)}</strong>
      <span style="color:${s.farbe}">${s.name}</span></p>` +
    bewertungszeilen(katalog, kind.stufe)
      .map((zeile) => zeileMitSkala({
        schluessel: `${kind.id}|${zeile.id}`,
        text: zeile.text,
        unterpunkte: zeile.art === 'sammel' ? zeile.enthaelt.map((k) => k.text) : [],
        gewaehlt: bewertungen[zeile.id],
      }))
      .join('');

  rasterVerdrahten();
}

/** Ein Kriterium, alle Kinder, die es betrifft. */
function fremdNachKriterium() {
  const zeitraum = aktuellerZeitraum();
  const zeilen = new Map();
  for (const s of new Set(datei.lernende.map((l) => l.stufe))) {
    for (const z of bewertungszeilen(katalog, s)) zeilen.set(z.id, z);
  }
  const liste = [...zeilen.values()];
  if (!zeileAktiv || !zeilen.has(zeileAktiv)) zeileAktiv = liste[0].id;

  $('#fremd-hinweis').textContent =
    'Ein Kriterium für alle – so bleibt der Maßstab über die Klasse gleich.';

  $('#fremd-wahl').innerHTML = liste
    .map((z) => {
      const stand = zeilenstand(z.id, zeitraum);
      return `<button type="button" class="wahl ${z.id === zeileAktiv ? 'aktiv' : ''} ${stand.fertig ? 'fertig' : ''}"
                      data-zeilenwahl="${z.id}">${escapen(z.text)}
                <span class="wahl-stand"><span class="nur-lesen">erfasst: </span>${standtext(stand)}</span>
              </button>`;
    })
    .join('');

  for (const knopf of $('#fremd-wahl').querySelectorAll('[data-zeilenwahl]')) {
    knopf.addEventListener('click', () => {
      zeileAktiv = knopf.dataset.zeilenwahl;
      fremdZeichnen();
    });
  }

  const zeile = zeilen.get(zeileAktiv);
  const betroffen = datei.lernende.filter((kind) =>
    bewertungszeilen(katalog, kind.stufe).some((z) => z.id === zeile.id)
  );

  $('#fremd-raster').innerHTML = betroffen.length
    ? `<p class="rastertitel"><strong>${escapen(zeile.text)}</strong></p>` +
      betroffen
        .map((kind) =>
          zeileMitSkala({
            schluessel: `${kind.id}|${zeile.id}`,
            text: kind.name,
            unterpunkte: [],
            gewaehlt: kd.einschaetzung(datei, kind.id, zeitraum, 'fremd')?.bewertungen?.[zeile.id],
          })
        )
        .join('')
    : '<p class="leer">Für dieses Kriterium gibt es hier niemanden.</p>';

  rasterVerdrahten();
}

/** Eine Erfassungszeile: Beschriftung links, Skala rechts. */
function zeileMitSkala({ schluessel, text, unterpunkte, gewaehlt }) {
  const knoepfe = katalog.skala
    .map(
      (s) => `
      <label class="${gewaehlt === s.id ? 'gewaehlt' : ''}" data-wert="${s.id}">
        <input type="radio" name="f_${schluessel}" value="${s.id}" ${gewaehlt === s.id ? 'checked' : ''}>
        <span aria-hidden="true">${s.kurz}</span>
        <span class="nur-lesen">${s.text}</span>
      </label>`
    )
    .join('');

  const details = unterpunkte.length
    ? `<ul class="teilkriterien">${unterpunkte.map((u) => `<li>${escapen(u)}</li>`).join('')}</ul>`
    : '';

  return `
    <div class="rasterzeile" data-schluessel="${schluessel}">
      <span class="rasterzeile-name">${escapen(text)}${details}</span>
      <div class="rasterskala">${knoepfe}</div>
    </div>`;
}

function rasterVerdrahten() {
  $('#fremd-raster').onchange = (ereignis) => {
    const zeileEl = ereignis.target.closest('.rasterzeile');
    const [kindId, zeilenId] = zeileEl.dataset.schluessel.split('|');
    const kind = datei.lernende.find((l) => l.id === kindId);

    kd.einschaetzungSetzen(datei, {
      schuelerId: kind.id,
      zeitraum: aktuellerZeitraum(),
      quelle: 'fremd',
      // Stufe mitschreiben: später ist sonst nicht mehr erkennbar, gegen
      // welche Anforderungen damals bewertet wurde
      stufe: kind.stufe,
      bewertungen: { [zeilenId]: ereignis.target.value },
    });

    for (const l of zeileEl.querySelectorAll('label')) {
      l.classList.toggle('gewaehlt', l.dataset.wert === ereignis.target.value);
    }
    merken();
    klassenlisteZeichnen();
    staendeAuffrischen();
  };
}

/**
 * „3/5" oder „✓" -- und für Screenreader das Häkchen als Wort, sonst liest es
 * je nach Stimme „Häkchen" oder gar nichts vor.
 */
function standtext(stand) {
  return stand.fertig
    ? '<span aria-hidden="true">✓</span><span class="nur-lesen">vollständig</span>'
    : `${stand.erfasst}/${stand.gesamt}`;
}

/** Wie viele Zeilen sind für dieses Kind erfasst? */
function kindstand(kind, zeitraum = aktuellerZeitraum()) {
  const zeilenIds = bewertungszeilen(katalog, kind.stufe).map((z) => z.id);
  return kd.erfassungsstand(datei, kind.id, zeitraum, 'fremd', zeilenIds);
}

/** Wie viele der betroffenen Kinder sind für diese Zeile schon eingeschätzt? */
function zeilenstand(zeileId, zeitraum = aktuellerZeitraum()) {
  const betroffen = datei.lernende.filter((k) =>
    bewertungszeilen(katalog, k.stufe).some((x) => x.id === zeileId)
  );
  const erfasst = betroffen.filter(
    (k) => kd.einschaetzung(datei, k.id, zeitraum, 'fremd')?.bewertungen?.[zeileId]
  ).length;
  return { erfasst, gesamt: betroffen.length, fertig: !!betroffen.length && erfasst === betroffen.length };
}

/** Nur die Zähler auffrischen -- ein Neuzeichnen würde den Fokus verlieren. */
function staendeAuffrischen() {
  const zeitraum = aktuellerZeitraum();
  for (const knopf of document.querySelectorAll('[data-kindwahl], [data-zeilenwahl]')) {
    const stand = knopf.dataset.kindwahl
      ? kindstand(datei.lernende.find((l) => l.id === knopf.dataset.kindwahl), zeitraum)
      : zeilenstand(knopf.dataset.zeilenwahl, zeitraum);
    knopf.classList.toggle('fertig', stand.fertig);
    knopf.querySelector('.wahl-stand').innerHTML =
      `<span class="nur-lesen">erfasst: </span>${standtext(stand)}`;
  }
}

// ---------------------------------------------------------------- Hilfen

function navigationVerdrahten() {
  for (const knopf of document.querySelectorAll('.navigation button')) {
    knopf.addEventListener('click', () => {
      for (const a of document.querySelectorAll('.ansicht')) {
        a.hidden = a.id !== `ansicht-${knopf.dataset.ansicht}`;
      }
      for (const k of document.querySelectorAll('.navigation button')) {
        k.classList.toggle('aktiv', k === knopf);
      }
      $('#kopf-titel').textContent = knopf.textContent;
      if (knopf.dataset.ansicht === 'import') importErgebnisZeichnen([]);
      if (knopf.dataset.ansicht === 'coaching') coachingBereitZeigen();
      // Beim Erfassen wird bewusst nur nachgezählt, nicht alles neu gezeichnet
      // (sonst springt der Fokus). Der Datei-Bereich stünde dadurch auf einem
      // alten Stand -- und dort hängt ein Löschknopf an genau diesen Zahlen.
      if (knopf.dataset.ansicht === 'datei') {
        dateiAngabenZeichnen();
        abschlussZeichnen();
        sicherungZeichnen();
      }
      window.scrollTo({ top: 0 });
    });
  }
}

function escapen(text) {
  const b = document.createElement('span');
  b.textContent = text;
  return b.innerHTML;
}

window.addEventListener('beforeunload', (e) => {
  if (datei && !datei.beispiel && offeneAenderungen) e.preventDefault();
});

starten();
