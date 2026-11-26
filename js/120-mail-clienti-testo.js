// ── Testo delle mail dei clienti (26/11/2026, richiesta di Erika) ─────────
// «Riporta la mail che scrivono i clienti, non solo l'indirizzo». Scelta di
// Erika: SUBITO dalle mail trascinate da Outlook nei progetti (js/104), POI
// in automatico da Outlook (Microsoft 365) quando Toli dà il via.
// Nessun SQL: per il riquadro «📨 Email e richieste del cliente» (js/112:
// scheda del cliente, finestra del nuovo progetto, scheda del progetto) si
// leggono le mail allegate ai progetti del cliente (cartella mail/, solo
// .eml: il .msg di Outlook per Windows non si legge, resta «Apri in Outlook»),
// si scaricano e se ne tira fuori mittente, data, oggetto e TESTO (parte
// text/plain, o text/html ripulita; senza la storia delle risposte sotto).
// Le vede chi vede i file del progetto (regole di oggi). Ultime 10 mail.

const MAIL_CLIENTE_TESTO_MAX = 3000;
const mailClienteLette = new Map();   // storage_path -> { mittente, oggetto, giorno, testo } | null

// Byte (stringa "binaria") -> testo con il set di caratteri della parte
function decodificaByteMail(bin, charset) {
  const bytes = Uint8Array.from(bin, function(c) { return c.charCodeAt(0) & 255; });
  try { return new TextDecoder(String(charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '')).decode(bytes); }
  catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}

function intestazioniParteMail(testa) {
  const out = {};
  testa.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function(r) {
    const m = r.match(/^([A-Za-z0-9-]+):[ \t]*(.*)$/);
    if (m) out[m[1].toLowerCase()] = m[2];
  });
  return out;
}

function parametroMail(valore, nome) {
  const m = String(valore || '').match(new RegExp(nome + '\\s*=\\s*("([^"]*)"|[^;\\s]+)', 'i'));
  return m ? (m[2] !== undefined ? m[2] : m[1]) : '';
}

// Una parte MIME: { tipo, testo } della parte di testo migliore (plain prima di html)
function parteTestoMail(raw, profondita) {
  const fine = raw.search(/\r?\n\r?\n/);
  const testa = intestazioniParteMail(fine >= 0 ? raw.slice(0, fine) : raw);
  const corpo = fine >= 0 ? raw.slice(fine).replace(/^\r?\n\r?\n/, '') : '';
  const ct = testa['content-type'] || 'text/plain';
  const tipo = ct.split(';')[0].trim().toLowerCase();
  if (tipo.indexOf('multipart/') === 0 && (profondita || 0) < 6) {
    const confine = parametroMail(ct, 'boundary');
    if (!confine) return null;
    const pezzi = corpo.split('--' + confine).slice(1).filter(function(p) { return !/^--/.test(p); });
    let html = null;
    for (const p of pezzi) {
      const x = parteTestoMail(p.replace(/^\r?\n/, ''), (profondita || 0) + 1);
      if (!x) continue;
      if (x.tipo === 'text/plain' && x.testo.trim()) return x;
      if (x.tipo === 'text/html' && !html) html = x;
    }
    return html;
  }
  if (tipo !== 'text/plain' && tipo !== 'text/html') return null;
  if (/attachment/i.test(testa['content-disposition'] || '')) return null;
  const cte = String(testa['content-transfer-encoding'] || '').trim().toLowerCase();
  let bin = corpo;
  if (cte === 'base64') { try { bin = atob(corpo.replace(/[^A-Za-z0-9+/=]/g, '')); } catch (e) { bin = ''; } }
  else if (cte === 'quoted-printable') bin = corpo.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
  let testo = decodificaByteMail(bin, parametroMail(ct, 'charset'));
  if (tipo === 'text/html') testo = testoDaHtmlMail(testo);
  return { tipo: tipo, testo: testo };
}

function testoDaHtmlMail(html) {
  const pulito = String(html).replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '$&\n');
  const doc = new DOMParser().parseFromString(pulito, 'text/html');
  doc.querySelectorAll('style, script, head').forEach(function(e) { e.remove(); });
  return (doc.body ? doc.body.textContent : '') || '';
}

// Toglie la storia delle risposte ("Il giorno … ha scritto:", "Da: …", "-----Original Message-----", righe con ">")
function senzaStoriaMail(testo) {
  const righe = String(testo).replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const out = [];
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i].trim();
    if (out.length && (/^-{2,}\s*(original message|messaggio originale)/i.test(r) || /^(il giorno|on) .{4,200}(ha scritto|wrote):?$/i.test(r) ||
        (/^(da|from):\s/i.test(r) && /^(inviato|sent|data|date|a|to):\s/i.test((righe[i + 1] || '').trim())))) break;
    if (/^>/.test(r)) continue;
    out.push(righe[i].replace(/\s+$/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// File .eml (Blob) -> { mittente, oggetto, giorno, testo }
async function leggiTestoMail(blob) {
  const buf = await blob.arrayBuffer();
  let bin = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  const fine = bin.search(/\r?\n\r?\n/);
  const testa = intestazioniParteMail(fine >= 0 ? bin.slice(0, fine) : bin);
  const campo = function(n) { return decodificaParoleMail(decodificaByteMail(testa[n] || '', 'utf-8')).replace(/\s+/g, ' ').trim(); };
  const d = testa.date ? new Date(testa.date) : null;
  const parte = parteTestoMail(bin, 0);
  const testo = parte ? senzaStoriaMail(parte.testo) : '';
  return {
    mittente: campo('from').replace(/^"([^"]*)"/, '$1'),
    oggetto: campo('subject'),
    giorno: d && !isNaN(d) ? dataLocaleISO(d) : '',
    testo: testo.length > MAIL_CLIENTE_TESTO_MAX ? testo.slice(0, MAIL_CLIENTE_TESTO_MAX).trim() + '…' : testo
  };
}

// Mail allegate ai progetti del cliente, con il testo (null se non si può leggere)
async function mailDeiProgettiCliente(clienteId) {
  if (!clienteId || typeof CARTELLA_MAIL_PROGETTO === 'undefined') return [];
  const rp = await db.from('progetti_tecnici').select('id, titolo').eq('cliente_id', clienteId).limit(200);
  if (rp.error || !(rp.data || []).length) return [];
  const titoli = {};
  rp.data.forEach(function(p) { titoli[p.id] = p.titolo; });
  const ra = await db.from('progetti_tecnici_allegati').select('id, progetto_id, nome_file, storage_path, caricato_il')
    .in('progetto_id', Object.keys(titoli)).like('storage_path', '%/' + CARTELLA_MAIL_PROGETTO + '/%')
    .order('caricato_il', { ascending: false }).limit(10);
  if (ra.error) { console.warn('Mail del cliente:', ra.error.message); return []; }
  const mail = (ra.data || []).filter(eMailProgetto);
  await Promise.all(mail.map(async function(m) {
    m.progetto = titoli[m.progetto_id] || '';
    if (!/\.eml$/i.test(m.nome_file)) { m.letta = null; return; }
    if (!mailClienteLette.has(m.storage_path)) {
      let letta = null;
      try {
        const { data, error } = await db.storage.from('progetti-tecnici').download(m.storage_path);
        if (!error && data) letta = await leggiTestoMail(data);
      } catch (e) { console.warn('Mail non letta:', e); }
      mailClienteLette.set(m.storage_path, letta);
    }
    m.letta = mailClienteLette.get(m.storage_path);
  }));
  return mail;
}

let mailClienteAperte = [];

function htmlMailClienteTesto(mail, opz) {
  mailClienteAperte = mail || [];
  return mailClienteAperte.map(function(m, i) {
    const l = m.letta;
    const titolo = l ? [l.giorno ? fd(l.giorno) : '', l.mittente, l.oggetto].filter(Boolean).join(' · ') : m.nome_file.replace(/^✉️\s*/, '').replace(/\.(eml|msg)$/i, '');
    return '<div style="padding:8px 0 0;margin-top:6px;border-top:0.5px solid var(--bo)" data-mail-cliente>' +
      '<div style="font-size:12px;color:var(--m)">✉️ Mail ' + esc(titolo) + (m.progetto ? ' · progetto «' + esc(m.progetto) + '»' : '') + '</div>' +
      (l && l.testo ? '<div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px;max-height:260px;overflow:auto">' + esc(l.testo) + '</div>'
        : '<div style="font-size:12px;color:var(--m)">' + (/\.msg$/i.test(m.nome_file) ? 'Mail di Outlook per Windows (.msg): il testo si legge aprendola dal progetto.' : 'Testo della mail non leggibile: aprila dal progetto.') + '</div>') +
      (opz && opz.copia && l && l.testo ? '<button type="button" class="btn sm" style="margin-top:4px" data-i="' + i + '" onclick="copiaMailInDescrizione(this.dataset.i)">↳ Copia nella descrizione tecnica</button>' : '') +
      '</div>';
  }).join('');
}

function copiaMailInDescrizione(i) {
  const m = mailClienteAperte[Number(i)];
  const campo = ge('mp-descrizione');
  if (!m || !m.letta || !campo) return;
  const testo = 'Mail del cliente' + (m.letta.giorno ? ' del ' + fd(m.letta.giorno) : '') + (m.letta.oggetto ? ' («' + m.letta.oggetto + '»)' : '') + ': ' + m.letta.testo;
  campo.value = campo.value.trim() ? campo.value.trim() + '\n\n' + testo : testo;
  campo.dispatchEvent(new Event('input'));
  toast('Mail copiata nella descrizione tecnica ✓', 'ok');
}
