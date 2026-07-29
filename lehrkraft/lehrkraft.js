// Lehrkraft-Anwendung -- Entwurf.
// Enthalten: Klassendatei anlegen/öffnen/speichern, Übersicht, Import der
// AirDrop-Dateien, Fremdeinschätzung. Coaching-Bogen und Druck folgen.

import { katalogLaden, stufe, bewertungszeilen, praeposition } from '../gemeinsam/katalog.js';
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
  $('#kind-anlegen').addEventListener('click', kindAnlegen);
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

  const adresse = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const verweis = Object.assign(document.createElement('a'), { href: adresse, download: name });
  document.body.append(verweis); verweis.click(); verweis.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
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
  zeilenwahlZeichnen();
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
      const punkte = kd
        .zeitraeumeDesBlocks(datei, zeitraum)
        .map((z) => {
          const selbst = kd.einschaetzung(datei, kind.id, z, 'selbst');
          const fremd = kd.einschaetzung(datei, kind.id, z, 'fremd');
          const art = selbst && fremd ? 'beide' : selbst || fremd ? 'halb' : 'leer';
          return `<span class="punkt ${art}" title="Zeitraum ${z}"></span>`;
        })
        .join('');

      return `
        <article class="kind" style="--farbe:${s.farbe}">
          <span class="kind-name">${escapen(kind.name)}</span>
          <span class="kind-stufe">${s.name}</span>
          <span class="kind-punkte">${punkte}</span>
        </article>`;
    })
    .join('');
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

function zeilenwahlZeichnen() {
  const stufen = [...new Set(datei.lernende.map((l) => l.stufe))];
  if (!stufen.length) {
    $('#zeilenwahl').innerHTML = '';
    $('#fremd-raster').innerHTML = '<p class="leer">Erst Kinder anlegen.</p>';
    return;
  }

  // Zeilen aller vorkommenden Stufen, ohne Dopplungen
  const zeilen = new Map();
  for (const s of stufen) {
    for (const z of bewertungszeilen(katalog, s)) zeilen.set(z.id, z);
  }
  const liste = [...zeilen.values()];
  if (!zeileAktiv || !zeilen.has(zeileAktiv)) zeileAktiv = liste[0].id;

  $('#zeilenwahl').innerHTML = liste
    .map(
      (z) =>
        `<button type="button" class="zeile ${z.id === zeileAktiv ? 'aktiv' : ''}"
                 data-zeile="${z.id}">${escapen(z.text)}</button>`
    )
    .join('');

  for (const knopf of $('#zeilenwahl').querySelectorAll('[data-zeile]')) {
    knopf.addEventListener('click', () => {
      zeileAktiv = knopf.dataset.zeile;
      zeilenwahlZeichnen();
    });
  }

  fremdRasterZeichnen(zeilen.get(zeileAktiv));
}

function fremdRasterZeichnen(zeile) {
  const zeitraum = kd.zeitraumFuer(datei);
  // nur Kinder, für die diese Zeile gilt
  const betroffen = datei.lernende.filter((kind) =>
    bewertungszeilen(katalog, kind.stufe).some((z) => z.id === zeile.id)
  );

  if (!betroffen.length) {
    $('#fremd-raster').innerHTML = '<p class="leer">Für diese Zeile gibt es hier niemanden.</p>';
    return;
  }

  $('#fremd-raster').innerHTML = betroffen
    .map((kind) => {
      const vorhanden = kd.einschaetzung(datei, kind.id, zeitraum, 'fremd')?.bewertungen?.[zeile.id];
      const knoepfe = katalog.skala
        .map(
          (s) => `
          <label class="${vorhanden === s.id ? 'gewaehlt' : ''}" data-wert="${s.id}">
            <input type="radio" name="f_${kind.id}" value="${s.id}" ${vorhanden === s.id ? 'checked' : ''}>
            <span aria-hidden="true">${s.kurz}</span>
            <span class="nur-lesen">${s.text}</span>
          </label>`
        )
        .join('');
      return `
        <div class="rasterzeile" data-schueler="${kind.id}">
          <span class="rasterzeile-name">${escapen(kind.name)}</span>
          <div class="rasterskala">${knoepfe}</div>
        </div>`;
    })
    .join('');

  $('#fremd-raster').onchange = (ereignis) => {
    const zeileEl = ereignis.target.closest('.rasterzeile');
    kd.einschaetzungSetzen(datei, {
      schuelerId: zeileEl.dataset.schueler,
      zeitraum,
      quelle: 'fremd',
      bewertungen: { [zeile.id]: ereignis.target.value },
    });
    for (const l of zeileEl.querySelectorAll('label')) {
      l.classList.toggle('gewaehlt', l.dataset.wert === ereignis.target.value);
    }
    merken();
    klassenlisteZeichnen();
  };
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
