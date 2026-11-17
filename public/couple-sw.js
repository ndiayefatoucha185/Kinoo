/* Service worker minimal de Kinoo Couple : rend l'application installable.
   Il ne met rien en cache (les échanges privés ne doivent jamais être stockés ici). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* le navigateur gère la requête normalement */ });
