// Lehrkraft-Anwendung.
// Klassendatei anlegen/öffnen/speichern, Klassenübersicht, Import der
// AirDrop-Dateien, Fremdeinschätzung, Verlauf je Kind, Coaching-Gespräch
// mit Bogen, Entscheidung und Druckansicht.

import {
  katalogLaden, stufe, bewertungszeilen, kriterienDerStufe, zeilenwert,
} from '../gemeinsam/katalog.js';
import { uebergabePruefen } from '../gemeinsam/uebergabe.js';
import { verschluesseln, entschluesseln, passphraseGuete } from '../gemeinsam/tresor.js';
import * as kd from '../gemeinsam/klassendatei.js';

const $ = (a) => document.querySelector(a);
const SCHLUESSEL_GRIFF = 'graduierung.lehrkraft.dateigriff';

let katalog;
let datei = null;      // die entschlüsselte Klassendatei
let passwort = null;   // nur im Arbeitsspeicher, nie gespeichert
let griff = null;      // FileSystemFileHandle, wo der Browser das kann
let zeileAktiv = null; // gewählte Zeile der Fremdeinschätzung
let offeneImporte = []; // Namen, die noch zugeordnet werden müssen

const kannDirektSchreiben = 'showSaveFilePicker' in window;

// ---------------------------------------------------------------- Start

async function starten() {
  try {
    katalog = await katalogLaden('../gemeinsam');
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

  $('#coaching-zurueck').addEventListener('click', () => kindZeigen(coachingKind.id));
  $('#coaching-drucken').addEventListener('click', () => window.print());
  $('#formular-coaching').addEventListener('submit', (e) => {
    e.preventDefault();
    coachingSpeichern();
  });
  $('#kind-anlegen').addEventListener('click', kindAnlegen);
  dateiVerdrahten();
  $('#kind-zurueck').addEventListener('click', () => {
    document.querySelector('.navigation button[data-ansicht="uebersicht"]').click();
  });
}

function einstiegVerdrahten() {
  $('#datei-neu').addEventListener('click', () => bereich('formular-neu'));
  $('#datei-oeffnen').addEventListener('click', dateiWaehlen);
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
    datei = beispielklasse(katalog);
    passwort = null;
    griff = null;
    offeneImporte = [];
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

  datei = kd.klasseAnlegen({ klasse, schuljahr, zyklusStart: start, katalogVersion: katalog.version });
  kd.lernendeAusListe(datei, $('#neu-namen').value, katalog.stufen[0].id);
  passwort = pw;
  griff = null;
  if (await speichern({ neuerOrt: true })) anwendungZeigen();
}

async function dateiWaehlen() {
  if (kannDirektSchreiben) {
    try {
      [griff] = await window.showOpenFilePicker({
        types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
      });
    } catch {
      return; // abgebrochen
    }
    $('#oeffnen-name').textContent = griff.name;
    bereich('formular-oeffnen');
    $('#oeffnen-passwort').focus();
    return;
  }

  // Rückfall ohne File System Access API (Safari): klassischer Dateidialog
  const eingabe = Object.assign(document.createElement('input'), { type: 'file', accept: '.gradu' });
  eingabe.addEventListener('change', () => {
    const gewaehlt = eingabe.files?.[0];
    if (!gewaehlt) return;
    griff = { name: gewaehlt.name, _datei: gewaehlt };
    $('#oeffnen-name').textContent = gewaehlt.name;
    bereich('formular-oeffnen');
  });
  eingabe.click();
}

async function dateiOeffnen() {
  const meldung = $('#oeffnen-fehler');
  try {
    const roh = griff._datei ?? (await griff.getFile());
    const inhalt = kd.pruefen(await entschluesseln(await roh.arrayBuffer(), $('#oeffnen-passwort').value));
    datei = inhalt;
    passwort = $('#oeffnen-passwort').value;
    meldung.hidden = true;
    anwendungZeigen();
  } catch (fehler) {
    meldung.textContent = fehler.message;
    meldung.hidden = false;
  }
}

/** Schreibt die Datei zurück. Ohne Schreibrecht wird sie heruntergeladen. */
async function speichern({ neuerOrt = false } = {}) {
  if (!datei) return false;
  // Beispieldaten bleiben im Arbeitsspeicher -- sie sollen nie als Datei
  // herumliegen und schon gar nicht eine echte Klassendatei überschreiben.
  if (datei.beispiel) {
    gesichertZeigen(true);
    return true;
  }
  const bytes = await verschluesseln(datei, passwort);
  const name = `Klasse-${datei.klasse}-${datei.schuljahr.replace('/', '-')}.gradu`;

  if (kannDirektSchreiben) {
    try {
      if (neuerOrt || !griff?.createWritable) {
        griff = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
        });
      }
      const strom = await griff.createWritable();
      await strom.write(bytes);
      await strom.close();
      gesichertZeigen(true);
      return true;
    } catch (fehler) {
      if (fehler.name === 'AbortError') return false;
    }
  }

  herunterladen(bytes, name);
  gesichertZeigen(true);
  return true;
}

let sicherungLaeuft = null;
/** Sammelt schnelle Änderungen und speichert gebündelt. */
function merken() {
  gesichertZeigen(false);
  clearTimeout(sicherungLaeuft);
  sicherungLaeuft = setTimeout(() => speichern(), 800);
}

function gesichertZeigen(fertig) {
  const feld = $('#gesichert');
  feld.textContent = fertig ? 'gesichert' : 'ändert …';
  feld.dataset.zustand = fertig ? 'fertig' : 'offen';
}

// ---------------------------------------------------------------- Datei-Bereich

function dateiVerdrahten() {
  $('#datei-sichern').addEventListener('click', async () => {
    clearTimeout(sicherungLaeuft);
    if (await speichern()) meldungKurz('#datei-sichern', 'Gesichert ✓');
  });

  // Bewusst ohne den gemerkten Griff: die Kopie soll woanders liegen,
  // die Arbeitsdatei bleibt, wo sie ist.
  $('#datei-kopie').addEventListener('click', async () => {
    if (!datei || datei.beispiel) return;
    const bytes = await verschluesseln(datei, passwort);
    const name = `Klasse-${datei.klasse}-${datei.schuljahr.replace('/', '-')}-${heuteKurz()}.gradu`;

    if (kannDirektSchreiben) {
      try {
        const ziel = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Klassendatei', accept: { 'application/octet-stream': ['.gradu'] } }],
        });
        const strom = await ziel.createWritable();
        await strom.write(bytes);
        await strom.close();
        meldungKurz('#datei-kopie', 'Kopie abgelegt ✓');
        return;
      } catch (fehler) {
        if (fehler.name === 'AbortError') return;
      }
    }
    herunterladen(bytes, name);
    meldungKurz('#datei-kopie', 'Kopie heruntergeladen ✓');
  });

  $('#datei-schliessen').addEventListener('click', async () => {
    clearTimeout(sicherungLaeuft);
    if (!datei.beispiel && !(await speichern())) return;
    location.reload();
  });
}

function herunterladen(bytes, name) {
  const adresse = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const verweis = Object.assign(document.createElement('a'), { href: adresse, download: name });
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
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
  const zeitraum = kd.zeitraumFuer(datei);
  const angaben = [
    ['Klasse', `${datei.klasse}, Schuljahr ${datei.schuljahr}`],
    ['Kinder', `${datei.lernende.length}`],
    ['Zeitraum', `${zeitraum} (Start ${datumLang(datei.zyklus.start)})`],
    ['Einschätzungen', `${datei.einschaetzungen.length}`],
    ['Coaching-Gespräche', `${datei.coachings.length}`],
    ['Zuletzt geändert', datei.geaendert ? new Date(datei.geaendert).toLocaleString('de-DE') : '–'],
    ['Ablage', datei.beispiel ? 'Beispieldaten – nur im Arbeitsspeicher'
      : griff?.name ?? 'wird beim Sichern abgefragt'],
  ];

  $('#datei-angaben').innerHTML = angaben
    .map(([k, w]) => `<div><dt>${k}</dt><dd>${escapen(String(w))}</dd></div>`)
    .join('');

  // Im Beispielmodus wäre Sichern irreführend
  for (const id of ['#datei-sichern', '#datei-kopie']) $(id).disabled = !!datei.beispiel;
}

// ---------------------------------------------------------------- Anwendung

function anwendungZeigen() {
  $('#einstieg').hidden = true;
  $('#anwendung').hidden = false;
  $('#beispielleiste').hidden = !datei.beispiel;
  $('#kopf-klasse').textContent = datei.klasse;
  $('#kopf-schuljahr').textContent = datei.schuljahr;
  alesZeichnen();
}

function alesZeichnen() {
  const zeitraum = kd.zeitraumFuer(datei);
  const fehlen = kd.fehlendeSelbsteinschaetzungen(datei, zeitraum).length;

  $('#leiste-zeitraum').textContent = `Zeitraum ${zeitraum}`;
  $('#leiste-status').textContent = !datei.lernende.length
    ? 'noch keine Kinder in der Liste'
    : kd.coachingFaellig(datei, zeitraum)
      ? 'Coaching-Gespräche stehen an'
      : fehlen
        ? `${fehlen} Selbsteinschätzung${fehlen === 1 ? '' : 'en'} fehlt noch`
        : 'alle Selbsteinschätzungen da';

  klassenlisteZeichnen();
  fremdZeichnen();
  dateiAngabenZeichnen();
}

function klassenlisteZeichnen() {
  const ziel = $('#klassenliste');
  const zeitraum = kd.zeitraumFuer(datei);

  if (!datei.lernende.length) {
    ziel.innerHTML = '<p class="leer">Noch keine Kinder angelegt.</p>';
    return;
  }

  ziel.innerHTML = datei.lernende
    .map((kind) => {
      const s = stufe(katalog, kind.stufe);
      const zeilenIds = bewertungszeilen(katalog, kind.stufe).map((r) => r.id);

      const punkte = kd
        .zeitraeumeDesBlocks(datei, zeitraum)
        .map((z) => {
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

          return `<span class="punkt ${art}" title="${hinweis}"></span>`;
        })
        .join('');

      return `
        <article class="kind" style="--farbe:${s.farbe}" data-kind="${kind.id}" tabindex="0" role="button">
          <span class="kind-name">${escapen(kind.name)}</span>
          <span class="kind-stufe">${s.name}</span>
          <span class="kind-punkte">${punkte}</span>
        </article>`;
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

  const faellig = kd.coachingFaellig(datei);
  $('#kind-coaching-starten').hidden = false;
  $('#kind-coaching-starten').textContent = faellig
    ? 'Coaching-Gespräch führen'
    : 'Coaching-Gespräch führen (noch nicht fällig)';
  $('#kind-coaching-starten').onclick = () => coachingZeigen(kind.id);

  bandZeichnen(kind);
  zeitraumtabelleZeichnen(kind);
  coachingsZeichnen(kind);
  window.scrollTo({ top: 0 });
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
  const bisher = kd.zeitraumFuer(datei);
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
    : '<p class="leer">Noch kein Coaching-Gespräch festgehalten.</p>';
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
  const ziel = $('#klassenliste');
  ziel.onclick = (e) => {
    const karte = e.target.closest('[data-kind]');
    if (karte) kindZeigen(karte.dataset.kind);
  };
  ziel.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const karte = e.target.closest('[data-kind]');
    if (!karte) return;
    e.preventDefault();
    kindZeigen(karte.dataset.kind);
  };
}

// ---------------------------------------------------------------- Coaching-Gespräch

let coachingKind = null;

function coachingZeigen(schuelerId) {
  coachingKind = datei.lernende.find((l) => l.id === schuelerId);
  if (!coachingKind) return;

  for (const a of document.querySelectorAll('.ansicht')) a.hidden = a.id !== 'ansicht-coaching';
  for (const k of document.querySelectorAll('.navigation button')) k.classList.remove('aktiv');

  const s = stufe(katalog, coachingKind.stufe);
  const zeitraum = kd.zeitraumFuer(datei);
  const bloecke = kd.zeitraeumeDesBlocks(datei, zeitraum);

  $('#kopf-titel').textContent = 'Coaching-Gespräch';
  $('#coaching-titel').textContent = coachingKind.name;
  $('#coaching-unter').textContent =
    `Aktuell ${s.name} · Zeiträume ${bloecke[0]} bis ${bloecke.at(-1)}`;

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
        <tr><th rowspan="2" class="kriterienspalte">Verantwortung ${praepositionText(kind.stufe)}</th>${kopf}</tr>
        <tr>${unterkopf}</tr>
      </thead>
      <tbody>${koerper}</tbody>
    </table>
    <p class="legende">${katalog.skala.map((s) => `<b>${s.kurz}</b> ${s.text}`).join(' · ')}</p>`;
}

function praepositionText(stufenId) {
  return { hafen: 'im Hafen', ankerplatz: 'am Ankerplatz', boie: 'an der Boie',
    'freie-see': 'auf Freier See' }[stufenId] ?? '';
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
  const hoch = kd_nachbar(kind.stufe, 'hoch');
  const runter = kd_nachbar(kind.stufe, 'runter');

  const auswahl = [
    hoch && { wert: 'hoch', titel: `Hochstufung auf ${stufe(katalog, hoch).name}`,
      text: 'Die Verantwortung dieser Stufe wird erfüllt.' },
    { wert: 'gleich', titel: `${stufe(katalog, kind.stufe).name} halten`,
      text: 'Noch nicht so weit – mit Begründung.' },
    runter && { wert: 'runter', titel: `Rückstufung auf ${stufe(katalog, runter).name}`,
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

function kd_nachbar(stufenId, richtung) {
  const kette = katalog.stufen.map((s) => s.id);
  const ziel = kette.indexOf(stufenId) + (richtung === 'hoch' ? 1 : -1);
  return kette[ziel] ?? null;
}

function entscheidungWechsel(wert, kind) {
  for (const feld of document.querySelectorAll('.entscheidung-feld')) {
    feld.classList.toggle('gewaehlt', feld.dataset.wert === wert);
  }

  $('#feld-gruende').hidden = wert !== 'runter';
  $('#feld-vereinbarungen').hidden = wert !== 'runter';
  $('#begruendung-pflicht').hidden = wert !== 'gleich';
  $('#coaching-ausweis').closest('.haken-feld').hidden = wert === 'gleich';

  if (wert === 'runter') gruendeZeichnen(kind);
}

/** Die Ankreuzliste entsteht aus dem Katalog -- kein zweiter Bogen zu pflegen. */
function gruendeZeichnen(kind) {
  $('#coaching-gruende').innerHTML = kd_rueckstufungsgruende(kind.stufe)
    .map(
      (g) => `
      <label class="grund">
        <input type="checkbox" value="${g.id}">
        <span>Er/sie ${escapen(g.text)}</span>
      </label>`
    )
    .join('');
}

function kd_rueckstufungsgruende(stufenId) {
  return kriterienDerStufe(katalog, stufenId).map((k) => ({ id: k.id, text: k.rueckstufung }));
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
    zeitraum: kd.zeitraumFuer(datei),
    entscheidung,
    begruendung,
    vereinbarungen: $('#coaching-vereinbarungen').value,
    gruende,
    gueltigAb: $('#coaching-gueltigab').value || undefined,
    ausweisUebergeben: $('#coaching-ausweis').checked,
  });

  merken();
  alesZeichnen();
  kindZeigen(coachingKind.id);
}

function kindAnlegen() {
  const name = prompt('Name des Kindes:');
  if (!name?.trim()) return;
  kd.lernendeAnlegen(datei, name, katalog.stufen[0].id);
  merken();
  alesZeichnen();
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
  alesZeichnen();
  importErgebnisZeichnen(ergebnisse);
  $('#datei-eingabe').value = '';
}

function importErgebnisZeichnen(ergebnisse) {
  // unbekannte Namen wandern in die Warteschlange und werden dort entschieden
  for (const e of ergebnisse.filter((e) => e.art === 'unbekannt')) offeneImporte.push(e);

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
    (zeilen
      ? `<h2>${erledigt.length} übernommen</h2><div class="meldungen">${zeilen}</div>
         <p class="hinweis">Denk daran, den Downloads-Ordner zu leeren –
            die empfangenen Dateien sind unverschlüsselt.</p>`
      : '');

  zuordnungVerdrahten();

  const fehlen = kd.fehlendeSelbsteinschaetzungen(datei);
  $('#import-fehlliste').innerHTML = fehlen.length
    ? `<h2>Fehlt noch (${fehlen.length})</h2><div class="meldungen">${fehlen
        .map((l) => meldung('offen', l.name, ''))
        .join('')}</div>`
    : '<p class="leer">Alle Selbsteinschätzungen dieses Zeitraums sind da.</p>';
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

function zuordnungVerdrahten() {
  const bereich = $('#import-ergebnis');

  bereich.querySelector('#alle-anlegen')?.addEventListener('click', () => {
    for (const offen of offeneImporte) kd.uebergabeAlsNeuesKind(datei, offen.uebergabe);
    offeneImporte = [];
    merken();
    alesZeichnen();
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
  alesZeichnen();
  importErgebnisZeichnen([]);
}

// ---------------------------------------------------------------- Fremdeinschätzung

// Zwei Wege durch dieselbe Aufgabe:
// „nach Kind" für die Vorbereitung eines Gesprächs (ein Kind komplett),
// „nach Kriterium" für den Klassendurchgang (ein Maßstab für alle).
let fremdModus = 'kind';
let fremdKindId = null;

function fremdVerdrahten() {
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
  const zeitraum = kd.zeitraumFuer(datei);

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
                <span class="wahl-stand">${stand.fertig ? '✓' : `${stand.erfasst}/${stand.gesamt}`}</span>
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
  const zeitraum = kd.zeitraumFuer(datei);
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
                <span class="wahl-stand">${stand.fertig ? '✓' : `${stand.erfasst}/${stand.gesamt}`}</span>
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
      zeitraum: kd.zeitraumFuer(datei),
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

/** Wie viele Zeilen sind für dieses Kind erfasst? */
function kindstand(kind, zeitraum = kd.zeitraumFuer(datei)) {
  const zeilenIds = bewertungszeilen(katalog, kind.stufe).map((z) => z.id);
  return kd.erfassungsstand(datei, kind.id, zeitraum, 'fremd', zeilenIds);
}

/** Wie viele der betroffenen Kinder sind für diese Zeile schon eingeschätzt? */
function zeilenstand(zeileId, zeitraum = kd.zeitraumFuer(datei)) {
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
  const zeitraum = kd.zeitraumFuer(datei);
  for (const knopf of document.querySelectorAll('[data-kindwahl], [data-zeilenwahl]')) {
    const stand = knopf.dataset.kindwahl
      ? kindstand(datei.lernende.find((l) => l.id === knopf.dataset.kindwahl), zeitraum)
      : zeilenstand(knopf.dataset.zeilenwahl, zeitraum);
    knopf.classList.toggle('fertig', stand.fertig);
    knopf.querySelector('.wahl-stand').textContent = stand.fertig
      ? '✓'
      : `${stand.erfasst}/${stand.gesamt}`;
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
  if (datei && !datei.beispiel && $('#gesichert').dataset.zustand === 'offen') e.preventDefault();
});

starten();
