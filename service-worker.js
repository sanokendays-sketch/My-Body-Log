const CACHE='my-body-log-v7';
const ASSETS=['./','./index.html','./styles.css','./app.js','./healthplanet-ocr.js','./vendor/tesseract/tesseract.min.js','./manifest.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('my-body-log-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(async res=>{if(res.ok)await caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())))});
