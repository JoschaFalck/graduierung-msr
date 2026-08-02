// QR-Code erzeugen -- ohne fremde Bibliothek, ohne CDN.
//
// Wozu: Nach dem Coaching-Gespräch soll die neue Stufe zurück aufs Kindergerät
// (KONZEPT Abschnitt 5). Ein *Decoder* wäre viel Arbeit -- der wird aber gar
// nicht gebraucht: Die iPad-Kamera erkennt QR-Codes von sich aus und öffnet die
// Adresse. Die Anwendung muss den Code also nur zeichnen.
//
// Umfang bewusst begrenzt: Byte-Modus, Fehlerkorrektur M, Fassungen 1 bis 10.
// Das reicht für rund 210 Zeichen -- mehr gehört nicht in einen Code, der aus
// zwei Metern Entfernung von einem iPad gescannt wird.
//
// Fehlerkorrektur M (~15 % wiederherstellbar) statt L: Der Code hängt an der
// Wand oder liegt auf dem Tisch, wird schräg und bei schlechtem Licht gescannt.

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // das Primitivpolynom der QR-Norm
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mal = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generatorpolynom für n Fehlerkorrektur-Stellen: (x-α⁰)(x-α¹)…(x-αⁿ⁻¹) */
function generator(n) {
  let g = [1]; // höchster Grad zuerst
  for (let i = 0; i < n; i++) {
    const neu = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      neu[j] ^= g[j];                    // mal x
      neu[j + 1] ^= mal(g[j], EXP[i]);   // mal α^i
    }
    g = neu;
  }
  return g;
}

/** Rest der Polynomdivision -- das sind die Fehlerkorrekturstellen. */
function fehlerkorrektur(daten, anzahl) {
  const g = generator(anzahl);
  const rest = [...daten, ...new Array(anzahl).fill(0)];
  for (let i = 0; i < daten.length; i++) {
    const faktor = rest[i];
    if (faktor === 0) continue;
    for (let j = 0; j < g.length; j++) rest[i + j] ^= mal(g[j], faktor);
  }
  return rest.slice(daten.length);
}

// ---------------------------------------------------------------- Tabellen
// Fehlerkorrektur M, Fassungen 1..10. Je Eintrag:
// [Stellen je Block für die Korrektur, Blöcke Gruppe 1, Datenstellen je Block,
//  Blöcke Gruppe 2, Datenstellen je Block]
// Aus ISO/IEC 18004, Tabelle 9. Nicht raten -- eine falsche Zeile ergibt einen
// Code, der sauber aussieht und sich nicht lesen lässt.
const BAUART = {
  1:  [10, 1, 16, 0, 0],
  2:  [16, 1, 28, 0, 0],
  3:  [26, 1, 44, 0, 0],
  4:  [18, 2, 32, 0, 0],
  5:  [24, 2, 43, 0, 0],
  6:  [16, 4, 27, 0, 0],
  7:  [18, 4, 31, 0, 0],
  8:  [22, 2, 38, 2, 39],
  9:  [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

/** Mittelpunkte der Ausrichtungsmuster je Fassung. */
const AUSRICHTUNG = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const datenstellen = (v) => {
  const [, b1, d1, b2, d2] = BAUART[v];
  return b1 * d1 + b2 * d2;
};

/** Wie viele Bytes passen im Byte-Modus in diese Fassung? */
function fassungsgroesse(v) {
  const zaehlerbits = v >= 10 ? 16 : 8;
  return Math.floor((datenstellen(v) * 8 - 4 - zaehlerbits) / 8);
}

/** Kleinste Fassung, in die der Text passt -- oder null. */
export function passendeFassung(bytes) {
  for (let v = 1; v <= 10; v++) if (bytes <= fassungsgroesse(v)) return v;
  return null;
}

export const HOECHSTLAENGE = fassungsgroesse(10);

// ---------------------------------------------------------------- Daten

function datenstrom(bytes, fassung) {
  const bits = [];
  const schreibe = (wert, anzahl) => {
    for (let i = anzahl - 1; i >= 0; i--) bits.push((wert >> i) & 1);
  };

  schreibe(0b0100, 4);                              // Byte-Modus
  schreibe(bytes.length, fassung >= 10 ? 16 : 8);   // Zeichenzähler
  for (const b of bytes) schreibe(b, 8);

  const gesamt = datenstellen(fassung) * 8;
  schreibe(0, Math.min(4, gesamt - bits.length));   // Abschluss
  while (bits.length % 8) bits.push(0);

  const stellen = [];
  for (let i = 0; i < bits.length; i += 8) {
    stellen.push(bits.slice(i, i + 8).reduce((z, b) => (z << 1) | b, 0));
  }
  // Auffüllen mit dem vorgeschriebenen Wechselmuster
  const fueller = [0xec, 0x11];
  while (stellen.length < datenstellen(fassung)) {
    stellen.push(fueller[(stellen.length - bits.length / 8) % 2]);
  }
  return stellen;
}

/**
 * Verschränkt Daten- und Korrekturblöcke. Ohne das läge ein Kratzer über einer
 * Stelle als zusammenhängender Schaden in einem einzigen Block -- die
 * Verschränkung verteilt ihn über alle.
 */
function verschraenken(stellen, fassung) {
  const [ecJeBlock, b1, d1, b2, d2] = BAUART[fassung];

  const bloecke = [];
  let ab = 0;
  for (let i = 0; i < b1; i++) { bloecke.push(stellen.slice(ab, ab + d1)); ab += d1; }
  for (let i = 0; i < b2; i++) { bloecke.push(stellen.slice(ab, ab + d2)); ab += d2; }

  const ec = bloecke.map((b) => fehlerkorrektur(b, ecJeBlock));

  const ergebnis = [];
  const laengste = Math.max(...bloecke.map((b) => b.length));
  for (let i = 0; i < laengste; i++) {
    for (const b of bloecke) if (i < b.length) ergebnis.push(b[i]);
  }
  for (let i = 0; i < ecJeBlock; i++) {
    for (const b of ec) ergebnis.push(b[i]);
  }
  return ergebnis;
}

// ---------------------------------------------------------------- Raster

function leerRaster(groesse) {
  return {
    feld: Array.from({ length: groesse }, () => new Int8Array(groesse).fill(-1)),
    fest: Array.from({ length: groesse }, () => new Uint8Array(groesse)),
    groesse,
  };
}

function setze(raster, zeile, spalte, wert, festhalten = true) {
  raster.feld[zeile][spalte] = wert;
  if (festhalten) raster.fest[zeile][spalte] = 1;
}

function sucherMuster(raster, zeile, spalte) {
  for (let z = -1; z <= 7; z++) {
    for (let s = -1; s <= 7; s++) {
      const zz = zeile + z;
      const ss = spalte + s;
      if (zz < 0 || ss < 0 || zz >= raster.groesse || ss >= raster.groesse) continue;
      const innen = z >= 0 && z <= 6 && s >= 0 && s <= 6;
      const dunkel =
        innen &&
        ((z === 0 || z === 6 || s === 0 || s === 6) ||
          (z >= 2 && z <= 4 && s >= 2 && s <= 4));
      setze(raster, zz, ss, dunkel ? 1 : 0);
    }
  }
}

function grundmuster(raster, fassung) {
  const n = raster.groesse;

  sucherMuster(raster, 0, 0);
  sucherMuster(raster, 0, n - 7);
  sucherMuster(raster, n - 7, 0);

  // Taktreihen
  for (let i = 8; i < n - 8; i++) {
    setze(raster, 6, i, i % 2 === 0 ? 1 : 0);
    setze(raster, i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Ausrichtungsmuster -- nicht über die Sucher legen
  const mitten = AUSRICHTUNG[fassung];
  for (const z of mitten) {
    for (const s of mitten) {
      if ((z === 6 && s === 6) || (z === 6 && s === n - 7) || (z === n - 7 && s === 6)) continue;
      for (let dz = -2; dz <= 2; dz++) {
        for (let ds = -2; ds <= 2; ds++) {
          const rand = Math.max(Math.abs(dz), Math.abs(ds));
          setze(raster, z + dz, s + ds, rand === 1 ? 0 : 1);
        }
      }
    }
  }

  setze(raster, n - 8, 8, 1); // die immer dunkle Stelle

  // Plätze für die Formatangaben freihalten
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { setze(raster, 8, i, 0); setze(raster, i, 8, 0); }
  }
  for (let i = 0; i < 8; i++) {
    setze(raster, 8, n - 1 - i, 0);
    if (i < 7) setze(raster, n - 1 - i, 8, 0);
  }

  if (fassung >= 7) {
    const bits = fassungsangabe(fassung);
    for (let i = 0; i < 18; i++) {
      const b = (bits >> i) & 1;
      setze(raster, Math.floor(i / 3), n - 11 + (i % 3), b);
      setze(raster, n - 11 + (i % 3), Math.floor(i / 3), b);
    }
  }
}

function fassungsangabe(fassung) {
  let wert = fassung << 12;
  for (let i = 17; i >= 12; i--) if ((wert >> i) & 1) wert ^= 0x1f25 << (i - 12);
  return (fassung << 12) | (wert & 0xfff);
}

function formatangabe(maske) {
  const daten = (0b00 << 3) | maske; // 00 = Fehlerkorrektur M
  let wert = daten << 10;
  for (let i = 14; i >= 10; i--) if ((wert >> i) & 1) wert ^= 0x537 << (i - 10);
  return ((daten << 10) | (wert & 0x3ff)) ^ 0x5412;
}

function formatSchreiben(raster, maske) {
  const bits = formatangabe(maske);
  const n = raster.groesse;
  for (let i = 0; i < 15; i++) {
    const b = (bits >> i) & 1;
    // erste Kopie um den linken oberen Sucher
    if (i < 6) setze(raster, 8, i, b);
    else if (i === 6) setze(raster, 8, 7, b);
    else if (i === 7) setze(raster, 8, 8, b);
    else if (i === 8) setze(raster, 7, 8, b);
    else setze(raster, 14 - i, 8, b);
    // zweite Kopie, damit ein beschädigter Sucher nicht alles kostet
    if (i < 8) setze(raster, 8, n - 1 - i, b);
    else setze(raster, n - 15 + i, 8, b);
  }
}

/** Zickzack von unten rechts nach oben, Spalte 6 (Taktreihe) übersprungen. */
function datenSchreiben(raster, stellen) {
  const n = raster.groesse;
  let bit = 0;
  const naechstes = () => {
    const wert = bit < stellen.length * 8 ? (stellen[bit >> 3] >> (7 - (bit % 8))) & 1 : 0;
    bit++;
    return wert;
  };

  let aufwaerts = true;
  for (let spalte = n - 1; spalte > 0; spalte -= 2) {
    if (spalte === 6) spalte--; // Taktreihe überspringen
    for (let i = 0; i < n; i++) {
      const zeile = aufwaerts ? n - 1 - i : i;
      for (const s of [spalte, spalte - 1]) {
        if (raster.fest[zeile][s]) continue;
        setze(raster, zeile, s, naechstes(), false);
      }
    }
    aufwaerts = !aufwaerts;
  }
}

const MASKEN = [
  (z, s) => (z + s) % 2 === 0,
  (z) => z % 2 === 0,
  (z, s) => s % 3 === 0,
  (z, s) => (z + s) % 3 === 0,
  (z, s) => (Math.floor(z / 2) + Math.floor(s / 3)) % 2 === 0,
  (z, s) => ((z * s) % 2) + ((z * s) % 3) === 0,
  (z, s) => (((z * s) % 2) + ((z * s) % 3)) % 2 === 0,
  (z, s) => (((z + s) % 2) + ((z * s) % 3)) % 2 === 0,
];

/**
 * Bewertet ein maskiertes Raster nach den vier Regeln der Norm. Niedriger ist
 * besser -- gesucht wird das Muster, das am wenigsten wie ein Suchmuster
 * aussieht und am wenigsten große einfarbige Flächen hat.
 */
function strafpunkte(feld, n) {
  let punkte = 0;

  // Regel 1: Reihen gleicher Farbe ab 5
  for (const waagerecht of [true, false]) {
    for (let a = 0; a < n; a++) {
      let lauf = 1;
      for (let b = 1; b < n; b++) {
        const jetzt = waagerecht ? feld[a][b] : feld[b][a];
        const vorher = waagerecht ? feld[a][b - 1] : feld[b - 1][a];
        if (jetzt === vorher) lauf++;
        else { if (lauf >= 5) punkte += 3 + (lauf - 5); lauf = 1; }
      }
      if (lauf >= 5) punkte += 3 + (lauf - 5);
    }
  }

  // Regel 2: einfarbige 2x2-Blöcke
  for (let z = 0; z < n - 1; z++) {
    for (let s = 0; s < n - 1; s++) {
      const w = feld[z][s];
      if (w === feld[z][s + 1] && w === feld[z + 1][s] && w === feld[z + 1][s + 1]) punkte += 3;
    }
  }

  // Regel 3: das Muster 1011101 mit vier hellen Stellen daneben
  const muster = [1, 0, 1, 1, 1, 0, 1];
  const passt = (hole, ab) => {
    for (let i = 0; i < 7; i++) if (hole(ab + i) !== muster[i]) return false;
    const vorne = [ab - 4, ab - 3, ab - 2, ab - 1].every((i) => i < 0 || hole(i) === 0);
    const hinten = [ab + 7, ab + 8, ab + 9, ab + 10].every((i) => i >= n || hole(i) === 0);
    return vorne || hinten;
  };
  for (let a = 0; a < n; a++) {
    for (let ab = 0; ab <= n - 7; ab++) {
      if (passt((i) => feld[a][i], ab)) punkte += 40;
      if (passt((i) => feld[i][a], ab)) punkte += 40;
    }
  }

  // Regel 4: Abweichung vom halbe-halbe-Verhältnis
  let dunkel = 0;
  for (let z = 0; z < n; z++) for (let s = 0; s < n; s++) dunkel += feld[z][s];
  const anteil = (dunkel * 100) / (n * n);
  punkte += Math.floor(Math.abs(anteil - 50) / 5) * 10;

  return punkte;
}

/**
 * Erzeugt den QR-Code zu einem Text und gibt ein Feld aus 0/1 zurück
 * (`matrix[zeile][spalte]`, 1 = dunkel). Wirft, wenn der Text nicht passt.
 */
export function qrErzeugen(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const fassung = passendeFassung(bytes.length);
  if (!fassung) {
    throw new Error(
      `Der Text ist zu lang für einen QR-Code (${bytes.length} von höchstens ${HOECHSTLAENGE} Zeichen).`
    );
  }

  const stellen = verschraenken(datenstrom(bytes, fassung), fassung);
  const n = fassung * 4 + 17;

  let bestes = null;
  let bestePunkte = Infinity;
  for (let maske = 0; maske < 8; maske++) {
    const raster = leerRaster(n);
    grundmuster(raster, fassung);
    datenSchreiben(raster, stellen);
    formatSchreiben(raster, maske);

    const feld = raster.feld.map((zeile, z) =>
      Array.from(zeile, (wert, s) =>
        raster.fest[z][s] ? wert : wert ^ (MASKEN[maske](z, s) ? 1 : 0)
      )
    );

    const punkte = strafpunkte(feld, n);
    if (punkte < bestePunkte) { bestePunkte = punkte; bestes = feld; }
  }
  return bestes;
}

/**
 * Zeichnet den Code als SVG. Kein Canvas: So bleibt er beim Vergrößern und
 * beim Drucken scharf, und im Beamer-Bild zählt genau das.
 */
export function qrAlsSvg(text, { rand = 4, kachel = 8 } = {}) {
  const feld = qrErzeugen(text);
  const n = feld.length;
  const seite = (n + rand * 2) * kachel;

  const wege = [];
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (feld[z][s]) wege.push(`M${(s + rand) * kachel} ${(z + rand) * kachel}h${kachel}v${kachel}h-${kachel}z`);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${seite} ${seite}" ` +
    `width="${seite}" height="${seite}" shape-rendering="crispEdges" role="img">` +
    `<rect width="${seite}" height="${seite}" fill="#fff"/>` +
    `<path d="${wege.join('')}" fill="#000"/></svg>`
  );
}
