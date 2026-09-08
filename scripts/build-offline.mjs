import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../gameclient/dist/', import.meta.url);
async function files(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + e.name;
    if (e.isDirectory()) out.push(...(await files(new URL(e.name + '/', dir), path + '/')));
    else if (!['service-worker.js'].includes(path)) out.push(path);
  }
  return out;
}
const paths = (await files(root)).sort(),
  hash = createHash('sha256');
for (const p of paths) {
  hash.update(p);
  hash.update(await readFile(new URL(p, root)));
}
const version = 'emberwatch-' + hash.digest('hex').slice(0, 16);
await writeFile(
  new URL('service-worker.js', root),
  `const CACHE=${JSON.stringify(version)},FILES=${JSON.stringify(paths.map((p) => '/' + p))};
self.addEventListener('install',event=>event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.addAll(FILES);}catch(error){await caches.delete(CACHE);throw error;}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('emberwatch-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='activate')self.skipWaiting();});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async c=>(await c.match('/index.html'))||fetch(event.request)));return;}if(FILES.includes(u.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(event.request)));});
`,
);
console.log(`Offline package: ${paths.length} files, ${version}`);
