// Service Worker für die Graduierungs-App.
// Liegt bewusst im Wurzelverzeichnis, damit sein Geltungsbereich auch
// ../gemeinsam/ umfasst -- ein Worker in schueler/ könnte den Katalog nicht abfangen.
//
// Strategie: Netz zuerst, Cache als Rückfall. So ist eine neu veröffentlichte
// Fassung sofort da, sobald WLAN vorhanden ist, und die App läuft trotzdem offline.
// (Cache zuerst wäre schneller, würde aber alte Fassungen auf den iPads festhalten --
// bei 25 Geräten, die man nicht einzeln entstauben kann, ein schlechter Tausch.)

const FASSUNG = 'graduierung-v39';

const VORRAT = [
  './',
  './index.html',
  './seite.css',
  './impressum.html',
  './datenschutz.html',
  './schueler/',
  './schueler/index.html',
  './schueler/schueler.js',
  './schueler/stil.css',
  './schueler/manifest.webmanifest',
  './gemeinsam/katalog.json',
  './gemeinsam/katalog.js',
  './gemeinsam/uebergabe.js',
  './gemeinsam/tresor.js',
  './gemeinsam/klassendatei.js',
  './gemeinsam/beispieldaten.js',
  './gemeinsam/griffe.js',
  './gemeinsam/qr.js',
  './gemeinsam/material.js',
  './material/',
  './material/index.html',
  './gemeinsam/kataloge/katalog-1.json',
  './gemeinsam/speicher.js',
  './lehrkraft/',
  './lehrkraft/index.html',
  './lehrkraft/lehrkraft.js',
  './lehrkraft/stil.css',
  './bilder/header.jpg',
  './bilder/stufen/hafen.jpg',
  './bilder/stufen/ankerplatz.jpg',
  './bilder/stufen/boie.jpg',
  './bilder/stufen/freie-see.jpg',
  './bilder/gesendet.png',
  './bilder/leer-verlauf.png',
  './bilder/leer-klasse.png',
  './bilder/leer-coaching.png',
  './bilder/alles-da.png',
  './bilder/einstieg-lehrkraft.jpg',
  './symbole/symbol-192.png',
  './symbole/symbol-512.png',
  './symbole/apple-touch-icon.png',
  './symbole/schullogo.png',
  // Die PDFs aus `material/` stehen bewusst NICHT hier: Der Geltungsbereich
  // des Workers ist `../`, der Vorrat würde also auch auf jedes Schüler-iPad
  // geladen -- rund 1,7 MB, die dort niemand braucht. Der fetch-Handler legt
  // sie nach dem ersten Öffnen ohnehin ab, damit sind sie danach offline da,
  // und zwar nur auf dem Gerät, das sie wirklich benutzt.
  './symbole/stufen/hafen.png',
  './symbole/stufen/ankerplatz.png',
  './symbole/stufen/boie.png',
  './symbole/stufen/freie-see.png',
];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    caches
      .open(FASSUNG)
      // einzeln, damit eine fehlende Datei nicht die ganze Installation kippt
      .then((lager) => Promise.allSettled(VORRAT.map((pfad) => lager.add(pfad))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== FASSUNG).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return;

  ereignis.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(FASSUNG).then((lager) => lager.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(async () => {
        const gelagert = await caches.match(anfrage);
        if (gelagert) return gelagert;
        // Seitenaufruf ohne Netz und ohne Treffer: Einstiegsseite ausliefern
        if (anfrage.mode === 'navigate') {
          const einstieg = await caches.match('./schueler/index.html');
          if (einstieg) return einstieg;
        }
        return new Response('Offline und nicht zwischengespeichert.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
