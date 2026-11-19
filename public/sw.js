// Service worker של התוכנית השנתית בלבד (scope: /tichnonshnati/).
// קיים כדי שהשירות של כיתה פלוס בשורש האתר לא ישלוט בדפים כאן. לא שומר מטמון — תמיד טוען מהרשת.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
