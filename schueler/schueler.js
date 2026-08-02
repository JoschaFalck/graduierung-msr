// Selbsteinschätzung – Schüleranwendung.
// Alles bleibt auf diesem Gerät. Gesendet wird nur die eine Übergabedatei
// (siehe ../gemeinsam/uebergabe.js), und zwar nur, wenn das Kind sie abschickt.

import { katalogLaden, kriterienDerStufe, stufe, praeposition } from '../gemeinsam/katalog.js';
import { uebergabeErzeugen, dateiname } from '../gemeinsam/uebergabe.js';

const SCHLUESSEL_PROFIL = 'graduierung.schueler.profil';
const SCHLUESSEL_VERLAUF = 'graduierung.schueler.verlauf';
const VERLAUF_MAX = 40;
const BELEG_MINDESTLAENGE = 10;

const $ = (auswahl) => document.querySelector(auswahl);

let katalog;
let profil;

// ---------------------------------------------------------------- Speicher

function profilLesen() {
  try {
    const roh = localStorage.getItem(SCHLUESSEL_PROFIL);
    return roh ? JSON.parse(roh) : null;
  } catch {
    return null;
  }
}

function profilSchreiben(neu) {
  profil = neu;
  localStorage.setItem(SCHLUESSEL_PROFIL, JSON.stringify(neu));
}

function verlaufLesen() {
  try {
    const roh = localStorage.getItem(SCHLUESSEL_VERLAUF);
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function verlaufErgaenzen(uebergabe) {
  const liste = [uebergabe, ...verlaufLesen()].slice(0, VERLAUF_MAX);
  localStorage.setItem(SCHLUESSEL_VERLAUF, JSON.stringify(liste));
}

// ---------------------------------------------------------------- Start

async function starten() {
  try {
    katalog = await katalogLaden('../gemeinsam');
  } catch (fehler) {
    const meldung = $('#ladefehler');
    meldung.textContent = `Die Anwendung konnte nicht geladen werden: ${fehler.message}`;
    meldung.hidden = false;
    return;
  }

  profil = profilLesen();
  navigationVerdrahten();
  einrichtungVerdrahten();
  formularVerdrahten();
  testmodusVerdrahten();
  $('#gesendet-weiter').addEventListener('click', () => {
    $('#gesendet').hidden = true;
    ansichtZeigen('verlauf');
  });

  offlineBereitstellen();

  if (profil) {
    anwendungZeigen();
  } else {
    einrichtungOeffnen();
  }
}

/**
 * Meldet den Service Worker an, damit die App offline läuft und sich auf den
 * Home-Bildschirm legen lässt. Scheitert das (etwa über http:// im Testbetrieb),
 * funktioniert alles Übrige unverändert weiter.
 */
function offlineBereitstellen() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
}

/** Läuft die App als eigenständige App vom Home-Bildschirm? */
function alsAppInstalliert() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function anwendungZeigen() {
  $('#einrichtung').hidden = true;
  $('#anwendung').hidden = false;
  document.documentElement.style.setProperty('--stufe', stufe(katalog, profil.stufe).farbe);
  ausweisZeichnen();
  formularZeichnen();
  verlaufZeichnen();
  testleisteZeichnen();
}

// ---------------------------------------------------------------- Testmodus

const SCHLUESSEL_TEST = 'graduierung.schueler.testmodus';

/**
 * Testmodus für Joscha: einmal .../schueler/#test aufrufen, dann bleibt er auf
 * diesem Gerät aktiv, bis er beendet wird. Erlaubt schnelles Durchspielen
 * verschiedener Stufen, ohne jedes Mal die Löschabfrage zu beantworten.
 * Auf Schülergeräten ist er nie aktiv -- dort ruft niemand #test auf.
 */
function testmodusAktiv() {
  return localStorage.getItem(SCHLUESSEL_TEST) === 'ja';
}

function testmodusVerdrahten() {
  if (adressangaben().includes('test')) localStorage.setItem(SCHLUESSEL_TEST, 'ja');
  if (!testmodusAktiv()) return;

  $('#test-stufe').innerHTML = katalog.stufen
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join('');

  $('#test-stufe').addEventListener('change', (ereignis) => {
    profilSchreiben({ ...profil, stufe: ereignis.target.value });
    anwendungZeigen();
    ansichtZeigen('ausweis');
  });

  $('#test-neu').addEventListener('click', () => {
    localStorage.removeItem(SCHLUESSEL_PROFIL);
    localStorage.removeItem(SCHLUESSEL_VERLAUF);
    profil = null;
    $('#eingabe-name').value = '';
    einrichtungOeffnen();
  });

  $('#test-aus').addEventListener('click', () => {
    localStorage.removeItem(SCHLUESSEL_TEST);
    location.hash = '';
    location.reload();
  });
}

function testleisteZeichnen() {
  const leiste = $('#testleiste');
  leiste.hidden = !testmodusAktiv();
  if (leiste.hidden) return;
  $('#test-profil').textContent = `${profil.name} · ${profil.klasse}`;
  $('#test-stufe').value = profil.stufe;
}

// ---------------------------------------------------------------- Einrichtung

function einrichtungVerdrahten() {
  const wahl = $('#stufenwahl');
  wahl.innerHTML = katalog.stufen
    .map(
      (s) => `
      <label>
        <input type="radio" name="stufe" value="${s.id}">
        <span class="stufen-punkt" style="background:${s.farbe}"></span>
        <span class="stufen-name">${s.name}<span class="stufen-motto">${s.motto}</span></span>
      </label>`
    )
    .join('');

  $('#einrichtung-fertig').addEventListener('click', einrichtungAbschliessen);
}

function einrichtungOeffnen() {
  const dialog = $('#einrichtung');
  if (profil) {
    $('#eingabe-name').value = profil.name;
    $('#eingabe-klasse').value = profil.klasse;
    const treffer = dialog.querySelector(`input[name="stufe"][value="${profil.stufe}"]`);
    if (treffer) treffer.checked = true;
  } else if (klasseAusAdresse()) {
    $('#eingabe-klasse').value = klasseAusAdresse();
  }
  $('#einrichtung-fehler').hidden = true;
  dialog.hidden = false;
  $('#anwendung').hidden = true;
}

/**
 * Angaben aus der Adresse, kommagetrennt: .../schueler/#8a  ·  #test  ·  #8a,test
 * Bewusst als Fragment -- das wird nie an den Server gesendet und bleibt
 * damit auf dem Gerät. Spart beim QR-Einstieg ein Eingabefeld.
 */
function adressangaben() {
  return decodeURIComponent(location.hash.replace(/^#/, ''))
    .split(',')
    .map((teil) => teil.trim())
    .filter(Boolean);
}

function klasseAusAdresse() {
  return adressangaben().find((teil) => /^[0-9]{1,2}[a-zA-Z]?$/.test(teil)) ?? '';
}

function einrichtungAbschliessen() {
  const name = $('#eingabe-name').value.trim();
  const klasse = $('#eingabe-klasse').value.trim();
  const gewaehlt = $('#einrichtung').querySelector('input[name="stufe"]:checked');
  const meldung = $('#einrichtung-fehler');

  const fehlt = [];
  if (!name) fehlt.push('deinen Namen');
  if (!klasse) fehlt.push('deine Klasse');
  if (!gewaehlt) fehlt.push('deine Stufe');

  if (fehlt.length) {
    meldung.textContent = `Bitte gib noch ${aufzaehlung(fehlt)} an.`;
    meldung.hidden = false;
    return;
  }

  profilSchreiben({ name, klasse, stufe: gewaehlt.value });
  anwendungZeigen();
  ansichtZeigen('ausweis');
}

function aufzaehlung(teile) {
  if (teile.length === 1) return teile[0];
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`;
}

// ---------------------------------------------------------------- Ausweis

function ausweisZeichnen() {
  const meine = stufe(katalog, profil.stufe);

  $('#titel-ausweis').textContent = profil.name;
  // „Ich lerne im Hafen“ / „… an der Boie“ -- die Präposition kommt aus dem
  // Katalog, damit hier keine zweite Schreibweise entsteht.
  $('#ausweis-stufe').textContent = praeposition(meine.id);
  $('#ausweis-motto').textContent = meine.motto;

  const symbol = $('#ausweis-symbol');
  symbol.src = `../symbole/stufen/${meine.id}.png`;
  symbol.alt = ''; // rein schmückend -- der Stufenname steht daneben

  // Das Bild der eigenen Stufe: vom geschützten Hafen bis auf die freie See.
  // Ebenfalls schmückend, der Stufenname steht direkt darunter.
  const bild = $('#ausweis-bild');
  bild.src = `../bilder/stufen/${meine.id}.jpg`;
  bild.alt = '';
  // Der Zuschnitt auf breiten Fenstern hängt am Motiv, nicht an der Stufe als
  // solcher -- die Regel dazu steht in stil.css bei `.ausweis-bild`.
  bild.dataset.stufe = meine.id;

  $('#liste-privilegien').innerHTML = katalog.stufen
    .filter((s) => s.reihenfolge <= meine.reihenfolge)
    .flatMap((s) => s.privilegien)
    .map((text) => `<li>${text}</li>`)
    .join('');

  $('#liste-verantwortung').innerHTML = katalog.stufen
    .filter((s) => s.reihenfolge <= meine.reihenfolge)
    .map(
      (s) =>
        `<li class="gruppe">${praeposition(s.id)}</li>` +
        s.eigeneKriterien
          .map((id) => `<li>${katalog.kriterien.find((k) => k.id === id).text}</li>`)
          .join('')
    )
    .join('');

  $('#stufe-aendern').onclick = einrichtungOeffnen;
  $('#profil-zuruecksetzen').onclick = allesLoeschen;
}

function allesLoeschen() {
  const sicher =
    testmodusAktiv() ||
    confirm(
      'Wirklich alles löschen?\n\nDein Name, deine Stufe und alle deine bisherigen ' +
        'Einschätzungen werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.'
    );
  if (!sicher) return;
  localStorage.removeItem(SCHLUESSEL_PROFIL);
  localStorage.removeItem(SCHLUESSEL_VERLAUF);
  profil = null;
  einrichtungOeffnen();
  $('#eingabe-name').value = '';
  $('#eingabe-klasse').value = '';
}

// ---------------------------------------------------------------- Einschätzung

function meineKriterien() {
  return kriterienDerStufe(katalog, profil.stufe);
}

function formularZeichnen() {
  const kriterien = meineKriterien();
  const nachStufe = new Map();
  for (const k of kriterien) {
    if (!nachStufe.has(k.stufe)) nachStufe.set(k.stufe, []);
    nachStufe.get(k.stufe).push(k);
  }

  let nummer = 0;
  $('#kriterien-liste').innerHTML = [...nachStufe]
    .map(
      ([stufenId, liste]) =>
        `<p class="gruppentitel">Verantwortung ${praeposition(stufenId)}</p>` +
        liste.map((k) => kriteriumFeld(k, ++nummer)).join('')
    )
    .join('');

  $('#beleg-kriterium').innerHTML =
    '<option value="">Bitte auswählen</option>' +
    kriterien.map((k) => `<option value="${k.id}">${k.text}</option>`).join('');

  $('#beleg-text').value = '';
  $('#beleg-zaehler').textContent = '0 Zeichen';
  $('#einschaetzung-fehler').hidden = true;
  fortschrittZeichnen();
}

function kriteriumFeld(k, nummer) {
  const knoepfe = katalog.skala
    .map(
      (s) => `
      <label>
        <input type="radio" name="k_${k.id}" value="${s.id}">
        <span class="zeichen" aria-hidden="true">${s.kurz}</span>
        <span>${s.text}</span>
      </label>`
    )
    .join('');

  // Bewusst kein fieldset/legend: der legend wird vom Browser aus dem Rahmen
  // geschnitten und lässt sich in einer Karte nicht zuverlässig platzieren.
  // role="group" + aria-labelledby ist für Screenreader gleichwertig.
  return `
    <div class="kriterium" data-kriterium="${k.id}" role="group" aria-labelledby="kt_${k.id}">
      <p class="kriterium-text" id="kt_${k.id}"><span class="kriterium-nummer">${nummer}</span>${k.text}</p>
      <div class="skala">${knoepfe}</div>
    </div>`;
}

/** Zählt beantwortete Kriterien und aktualisiert Balken und Häkchen. */
function fortschrittZeichnen() {
  const felder = [...document.querySelectorAll('.kriterium')];
  let fertig = 0;

  for (const feld of felder) {
    const beantwortet = !!feld.querySelector('input:checked');
    feld.classList.toggle('beantwortet', beantwortet);
    if (beantwortet) fertig++;
  }

  const gesamt = felder.length;
  $('#fortschritt-zahl').textContent = `${fertig} von ${gesamt}`;
  $('#fortschritt-fuellung').style.width = gesamt ? `${(fertig / gesamt) * 100}%` : '0';

  const balken = $('#fortschritt-balken');
  balken.setAttribute('aria-valuenow', fertig);
  balken.setAttribute('aria-valuemax', gesamt);
}

function formularVerdrahten() {
  $('#beleg-text').addEventListener('input', (ereignis) => {
    $('#beleg-zaehler').textContent = `${ereignis.target.value.trim().length} Zeichen`;
  });

  $('#formular-einschaetzung').addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    absenden();
  });

  $('#kriterien-liste').addEventListener('change', (ereignis) => {
    ereignis.target.closest('.kriterium')?.classList.remove('offen');
    fortschrittZeichnen();
  });
}

function formularEinlesen() {
  const bewertungen = {};
  const offen = [];

  for (const k of meineKriterien()) {
    const gewaehlt = $(`input[name="k_${k.id}"]:checked`);
    if (gewaehlt) bewertungen[k.id] = gewaehlt.value;
    else offen.push(k.id);
  }

  return {
    bewertungen,
    offen,
    beleg: {
      kriteriumId: $('#beleg-kriterium').value,
      text: $('#beleg-text').value.trim(),
    },
  };
}

async function absenden() {
  const { bewertungen, offen, beleg } = formularEinlesen();
  const meldung = $('#einschaetzung-fehler');

  for (const feld of document.querySelectorAll('.kriterium')) {
    feld.classList.toggle('offen', offen.includes(feld.dataset.kriterium));
  }

  if (offen.length) {
    meldung.textContent =
      offen.length === 1
        ? 'Eine Frage fehlt noch – sie ist rot umrandet.'
        : `Es fehlen noch ${offen.length} Antworten – sie sind rot umrandet.`;
    meldung.hidden = false;
    document.querySelector('.kriterium.offen')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  if (!beleg.kriteriumId) {
    meldung.textContent = 'Wähle noch aus, woran du besonders gearbeitet hast.';
    meldung.hidden = false;
    $('#beleg-kriterium').focus();
    return;
  }

  if (beleg.text.length < BELEG_MINDESTLAENGE) {
    meldung.textContent = 'Schreib bitte noch einen ganzen Satz dazu.';
    meldung.hidden = false;
    $('#beleg-text').focus();
    return;
  }

  meldung.hidden = true;

  const uebergabe = uebergabeErzeugen({
    schueler: profil,
    stufe: profil.stufe,
    bewertungen,
    beleg,
    katalogVersion: katalog.version,
  });

  const erfolg = await uebergabeSenden(uebergabe);
  if (!erfolg) return;

  verlaufErgaenzen(uebergabe);
  formularZeichnen();
  verlaufZeichnen();
  $('#tipp-merken').hidden = alsAppInstalliert();
  $('#gesendet').hidden = false;
}

/**
 * Teilt die Datei über das iOS-Teilen-Menü (dort liegt AirDrop).
 * Wo das nicht geht, wird sie heruntergeladen und kann von Hand geteilt werden.
 * Rückgabe false, wenn abgebrochen wurde -- dann gilt nichts als gesendet.
 */
async function uebergabeSenden(uebergabe) {
  const name = dateiname(uebergabe);
  const inhalt = JSON.stringify(uebergabe, null, 2);
  const datei = new File([inhalt], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: 'Selbsteinschätzung' });
      $('#gesendet-text').textContent = 'Deine Selbsteinschätzung ist unterwegs.';
      return true;
    } catch (fehler) {
      if (fehler.name === 'AbortError') return false;
      // Teilen nicht möglich -- unten als Datei sichern.
    }
  }

  herunterladen(inhalt, name);
  $('#gesendet-text').textContent =
    'Deine Selbsteinschätzung wurde als Datei gesichert. ' +
    'Teile sie über die Dateien-App per AirDrop mit deiner Lehrkraft.';
  return true;
}

function herunterladen(inhalt, name) {
  const adresse = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
  const verweis = Object.assign(document.createElement('a'), { href: adresse, download: name });
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

// ---------------------------------------------------------------- Verlauf

function verlaufZeichnen() {
  const liste = verlaufLesen();
  const ziel = $('#verlauf-liste');

  if (!liste.length) {
    ziel.innerHTML =
      '<p class="leer"><img class="leer-bild" src="../bilder/leer-verlauf.png" alt="" ' +
      'width="512" height="341">Noch nichts da.<br>Deine erste Selbsteinschätzung erscheint hier.</p>';
    return;
  }

  ziel.innerHTML = liste.map(eintragZeichnen).join('');

  for (const knopf of ziel.querySelectorAll('[data-nochmal]')) {
    knopf.addEventListener('click', async () => {
      const eintrag = liste[Number(knopf.dataset.nochmal)];
      if (!(await uebergabeSenden(eintrag))) return;
      $('#tipp-merken').hidden = alsAppInstalliert();
      $('#gesendet').hidden = false;
    });
  }
}

function eintragZeichnen(eintrag, nummer) {
  const meine = katalog.stufen.find((s) => s.id === eintrag.stufe);
  const werte = Object.values(eintrag.bewertungen);
  const zaehlen = (id) => werte.filter((w) => w === id).length;
  const belegKriterium = katalog.kriterien.find((k) => k.id === eintrag.beleg?.kriteriumId);

  const datum = new Date(eintrag.erstellt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `
    <article class="eintrag" style="border-left-color:${meine?.farbe ?? 'var(--linie)'}">
      <div class="eintrag-kopf">
        <span class="eintrag-datum">${datum}</span>
        <span class="eintrag-stufe">${meine?.name ?? eintrag.stufe}</span>
      </div>
      <p class="eintrag-bilanz">
        <span class="bilanz-gut">✓ ${zaehlen('erreicht')} erreicht</span>
        <span class="bilanz-mittel">~ ${zaehlen('teilweise')} teilweise</span>
        <span class="bilanz-offen">○ ${zaehlen('nicht')} noch nicht</span>
      </p>
      ${
        eintrag.beleg?.text
          ? `<p class="eintrag-beleg">${belegKriterium ? `<strong>${belegKriterium.text}</strong><br>` : ''}${escapen(eintrag.beleg.text)}</p>`
          : ''
      }
      <button type="button" class="knopf-leise" data-nochmal="${nummer}">Noch einmal senden</button>
    </article>`;
}

function escapen(text) {
  const behaelter = document.createElement('span');
  behaelter.textContent = text;
  return behaelter.innerHTML;
}

// ---------------------------------------------------------------- Navigation

function navigationVerdrahten() {
  for (const knopf of document.querySelectorAll('.navigation button')) {
    knopf.addEventListener('click', () => ansichtZeigen(knopf.dataset.ansicht));
  }
}

function ansichtZeigen(name) {
  for (const abschnitt of document.querySelectorAll('.ansicht')) {
    abschnitt.hidden = abschnitt.id !== `ansicht-${name}`;
  }
  for (const knopf of document.querySelectorAll('.navigation button')) {
    knopf.classList.toggle('aktiv', knopf.dataset.ansicht === name);
  }
  window.scrollTo({ top: 0 });
}

starten();
