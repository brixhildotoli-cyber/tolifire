// Prova della FILA delle richieste al database (js/01, 12/11).
// Nessun database: una pagina vuota carica js/01-core.js con un client
// Supabase finto e un fetch finto (lento, in errore, appeso). Controlla:
//  1. mai più di FILA_DB.max richieste in corso insieme;
//  2. errori e richieste appese non bloccano la fila (si svuota sempre);
//  3. una richiesta interrotta mentre aspetta esce dalla fila;
//  4. letture identiche contemporanee = una sola richiesta, ognuno la sua copia;
//  5. /auth non fa la fila; le scritture contano in FILA_DB.scritture;
//  6. tabelle quasi fisse (utenti...) rilette entro 60 s = memoria, ma non dopo una scrittura.
// Uso: cd test && node fila-richieste.spec.js   (TUTTO OK / FALLITO)
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '..');
const CHROME = process.env.SMOKE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PAGINA = `<!doctype html><meta charset="utf-8"><body>
<script>
  // client Supabase finto: basta che createClient restituisca qualcosa
  window.supabase = { createClient: function(u, k, o) { return { _opzioni: o, auth: {}, storage: { from: function() { return {}; } }, from: function() { return {}; }, rpc: function() {} }; } };
  window.CHIAMATE = [];
  window.IN_CORSO = 0; window.MAX_IN_CORSO = 0;
  window.fetch = function(url, o) {
    url = String(url);
    CHIAMATE.push((o && o.method || 'GET') + ' ' + url);
    IN_CORSO++; MAX_IN_CORSO = Math.max(MAX_IN_CORSO, IN_CORSO);
    const fine = function() { IN_CORSO--; };
    if (/appesa/.test(url)) return new Promise(function() {});           // mai risposta
    if (/errore/.test(url)) return new Promise(function(ok, ko) { setTimeout(function() { fine(); ko(new TypeError('Failed to fetch')); }, 30); });
    const ms = /lenta/.test(url) ? 120 : 20;
    return new Promise(function(ok) { setTimeout(function() { fine(); ok(new Response(JSON.stringify({ url: url }), { status: 200, headers: { 'content-type': 'application/json' } })); }, ms); });
  };
</script>
<script src="/js/01-core.js"></script>
</body>`;

function avviaSito() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGINA); }
      const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(REPO) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => ok(srv));
  });
}

(async () => {
  const srv = await avviaSito();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  const errori = [];
  page.on('pageerror', e => errori.push(String(e.message)));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/', { waitUntil: 'load' });
  const esiti = await page.evaluate(async () => {
    const out = [];
    const prova = (nome, ok, dettaglio) => out.push({ nome, ok: !!ok, dettaglio: dettaglio || '' });
    if (typeof fetchSupabaseInFila !== 'function' || typeof FILA_DB === 'undefined') { prova('js/01 caricato', false, 'fetchSupabaseInFila mancante'); return out; }
    prova('db usa la fila', db._opzioni && db._opzioni.global && db._opzioni.global.fetch === fetchSupabaseInFila);
    FILA_DB.attesaMaxMs = 400;
    const B = 'https://syjbpxtkcsazpynyvoss.supabase.co';
    const h = { headers: { authorization: 'Bearer x' } };

    // 1-2. 30 richieste diverse: lente, in errore, 3 appese
    MAX_IN_CORSO = 0;
    const lista = [];
    for (let i = 0; i < 30; i++) {
      const tipo = i % 10 === 3 ? 'appesa' : (i % 4 === 1 ? 'errore' : 'lenta');
      lista.push(fetchSupabaseInFila(B + '/rest/v1/' + tipo + '?n=' + i, h).then(r => r.json()).then(() => 'ok', () => 'ko'));
    }
    const finite = await Promise.race([
      Promise.all(lista.filter((p, i) => i % 10 !== 3)),
      new Promise(r => setTimeout(() => r(null), 8000))
    ]);
    prova('le 27 richieste non appese finiscono', finite && finite.length === 27, finite ? finite.filter(x => x === 'ko').length + ' errori' : 'ferma');
    prova('mai più di ' + FILA_DB.max + ' insieme (le 3 appese restano aperte nel fetch finto)', FILA_DB.conteggio.maxInCorso <= FILA_DB.max && MAX_IN_CORSO <= FILA_DB.max + 3, 'max fila ' + FILA_DB.conteggio.maxInCorso + ', max fetch ' + MAX_IN_CORSO);
    await new Promise(r => setTimeout(r, 600));
    prova('fila vuota dopo errori e appese', FILA_DB.inCorso === 0 && FILA_DB.attesa.length === 0, 'in corso ' + FILA_DB.inCorso + ', in attesa ' + FILA_DB.attesa.length);
    const dopo = await Promise.race([fetchSupabaseInFila(B + '/rest/v1/lenta?dopo=1', h).then(r => r.status), new Promise(r => setTimeout(() => r('ferma'), 3000))]);
    prova('una richiesta dopo passa subito', dopo === 200, String(dopo));

    // 3. interrotta mentre aspetta
    const tappi = [];
    for (let i = 0; i < FILA_DB.max; i++) tappi.push(fetchSupabaseInFila(B + '/rest/v1/lenta?tappo=' + i, h));
    const ac = new AbortController();
    const interrotta = fetchSupabaseInFila(B + '/rest/v1/lenta?interrotta=1', Object.assign({ signal: ac.signal }, h)).then(() => 'arrivata', e => e.name);
    const inAttesa = FILA_DB.attesa.length;
    ac.abort();
    const esitoInterrotta = await interrotta;
    prova('interrotta in fila esce subito', inAttesa === 1 && esitoInterrotta === 'AbortError' && !CHIAMATE.some(c => /interrotta=1/.test(c)), inAttesa + ' in attesa, ' + esitoInterrotta);
    await Promise.all(tappi);

    // 4. letture identiche contemporanee
    const prima = CHIAMATE.length;
    const uguali = await Promise.all([1, 2, 3, 4, 5].map(() => fetchSupabaseInFila(B + '/rest/v1/lenta?uguale=1', h).then(r => r.json())));
    const fatte = CHIAMATE.slice(prima).filter(c => /uguale=1/.test(c)).length;
    prova('5 letture uguali = 1 richiesta, 5 risposte', fatte === 1 && uguali.every(x => x && /uguale=1/.test(x.url)), fatte + ' richieste');
    const altroUtente = CHIAMATE.length;
    await Promise.all([fetchSupabaseInFila(B + '/rest/v1/lenta?u=1', { headers: { authorization: 'Bearer a' } }), fetchSupabaseInFila(B + '/rest/v1/lenta?u=1', { headers: { authorization: 'Bearer b' } })]);
    prova('stessa lettura con un altro token = 2 richieste', CHIAMATE.slice(altroUtente).length === 2);
    const p0 = CHIAMATE.length;
    await Promise.all([fetchSupabaseInFila(B + '/rest/v1/x', { method: 'PATCH', body: '{}', headers: h.headers }), fetchSupabaseInFila(B + '/rest/v1/x', { method: 'PATCH', body: '{}', headers: h.headers })]);
    prova('le scritture uguali NON si uniscono', CHIAMATE.slice(p0).length === 2);

    // 5. auth fuori dalla fila; scritture contate
    const tappi2 = [];
    for (let i = 0; i < FILA_DB.max + 4; i++) tappi2.push(fetchSupabaseInFila(B + '/rest/v1/lenta?tappo2=' + i, h));
    const a0 = CHIAMATE.length;
    const auth = fetchSupabaseInFila(B + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: '{}' });
    prova('/auth parte subito anche con la fila piena', CHIAMATE.slice(a0).some(c => /auth\/v1\/token/.test(c)));
    await auth; await Promise.all(tappi2);
    const s0 = FILA_DB.scritture;
    await fetchSupabaseInFila(B + '/rest/v1/rpc/smistamento_progetto', { method: 'POST', body: '{"p_progetto":"1"}', headers: h.headers });
    await fetchSupabaseInFila(B + '/storage/v1/object/sign/b/x.jpg', { method: 'POST', body: '{}', headers: h.headers });
    const s1 = FILA_DB.scritture;
    await fetchSupabaseInFila(B + '/rest/v1/rpc/salva_qualcosa', { method: 'POST', body: '{}', headers: h.headers });
    prova('letture RPC e firme non contano, le altre RPC sì', s1 === s0 && FILA_DB.scritture === s0 + 1, s0 + ' ' + s1 + ' ' + FILA_DB.scritture);
    // 6. memoria breve delle tabelle quasi fisse
    const q0 = CHIAMATE.length;
    const u1 = await fetchSupabaseInFila(B + '/rest/v1/utenti?select=id', h).then(r => r.json());
    const u2 = await fetchSupabaseInFila(B + '/rest/v1/utenti?select=id', h).then(r => r.json());
    await fetchSupabaseInFila(B + '/rest/v1/clienti?select=id', h); await fetchSupabaseInFila(B + '/rest/v1/clienti?select=id', h);
    prova('utenti riletti subito = 1 richiesta (clienti 2)', CHIAMATE.slice(q0).filter(c => /utenti/.test(c)).length === 1 && CHIAMATE.slice(q0).filter(c => /clienti/.test(c)).length === 2 && u1.url === u2.url);
    await fetchSupabaseInFila(B + '/rest/v1/utenti?id=eq.1', { method: 'PATCH', body: '{}', headers: h.headers });
    const q1 = CHIAMATE.length;
    await fetchSupabaseInFila(B + '/rest/v1/utenti?select=id', h);
    prova('dopo una scrittura si rilegge', CHIAMATE.slice(q1).filter(c => /GET .*utenti\?select=id/.test(c)).length === 1);
    prova('fila vuota alla fine', FILA_DB.inCorso === 0 && FILA_DB.attesa.length === 0 && FILA_DB.inVolo.size === 0);
    return out;
  });
  await browser.close(); srv.close();
  let ko = 0;
  errori.filter(e => !/is not defined|Cannot read|null/.test(e)).forEach(e => console.log('  (errore pagina) ' + e));
  esiti.forEach(e => { if (!e.ok) ko++; console.log((e.ok ? '✓ ' : '✗ ') + e.nome + (e.dettaglio ? ' (' + e.dettaglio + ')' : '')); });
  console.log(ko ? 'FALLITO: ' + ko + ' prove' : 'TUTTO OK');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('PROVA INTERROTTA: ' + e.stack); process.exit(2); });
