// ── F14.6 — Edge Function "avvisi-urgenti" (sql/66) ──────────────────
// La chiama SOLO il database (pg_net, trigger trg_avvisi_invio_urgente e
// riepilogo delle 8:00 di sql/66) con l'header x-toli-segreto = la chiave
// condivisa salvata nel Vault (toli_push_segreto) e nei segreti di questa
// funzione (TOLI_PUSH_SEGRETO). Senza la chiave giusta risponde 401.
//
//   POST {"modo":"urgente","avviso_id":123}
//        → notifica Web Push a ogni dispositivo acceso dei destinatari e
//          email (Brevo) ai destinatari; esito di ognuno nel registro
//          avvisi_invii (registra_invio_avviso).
//   POST {"modo":"riepilogo"}            (pg_cron, ore 8:00 lavorative)
//   POST {"modo":"riepilogo","utente_id":"..."}   (prova del titolare)
//        → una email per persona con i suoi avvisi aperti.
//
// NESSUNA CHIAVE IN QUESTO FILE: tutto dai segreti della funzione
// (supabase secrets set ...; vedi LEGGIMI.md):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//   TOLI_PUSH_SEGRETO, SITO_URL (es. https://utente.github.io/gestionale/)
//   BREVO_API_KEY, EMAIL_MITTENTE, EMAIL_MITTENTE_NOME (facoltativo)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY li mette Supabase da solo.
// Senza VAPID niente notifiche, senza BREVO_API_KEY niente email: il
// resto funziona e il registro scrive "saltato" con il motivo.
// Si pubblica con:  supabase functions deploy avvisi-urgenti --no-verify-jwt
// (il controllo lo fa la chiave condivisa, non il JWT: la chiama pg_net).

import webpush from "npm:web-push@3.6.7";

const env = (k: string) => (Deno.env.get(k) || "").trim();
const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const SEGRETO = env("TOLI_PUSH_SEGRETO");
const SITO_URL = env("SITO_URL").replace(/#.*$/, "");
const VAPID_PUBLIC = env("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = env("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = env("VAPID_SUBJECT") || "mailto:amministrazione@toli-fire.com";
const BREVO_KEY = env("BREVO_API_KEY");
const BREVO_URL = env("BREVO_API_URL") || "https://api.brevo.com/v3/smtp/email";
const MITTENTE = env("EMAIL_MITTENTE");
const MITTENTE_NOME = env("EMAIL_MITTENTE_NOME") || "TOLI Fire – Gestionale";

const pushPronto = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (pushPronto) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const emailPronta = !!(BREVO_KEY && MITTENTE);

type Dispositivo = { id: number; endpoint: string; p256dh: string; auth: string };
type Destinatario = { utente_id: string; nome: string | null; email: string | null; dispositivi: Dispositivo[] };
type AvvisoBreve = { id: number; testo: string; scadenza: string | null; urgente: boolean; tipo: string };

function uguali(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function risposta(stato: number, dati: unknown): Response {
  return new Response(JSON.stringify(dati), { status: stato, headers: { "Content-Type": "application/json" } });
}

async function rpc(nome: string, parametri: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(parametri),
  });
  const testo = await r.text();
  if (!r.ok) throw new Error(`${nome}: HTTP ${r.status} ${testo.slice(0, 200)}`);
  return testo ? JSON.parse(testo) : null;
}

async function registra(p: {
  avviso_id: number | null; canale: string; utente_id: string | null; destinazione: string | null;
  esito: "inviato" | "errore" | "saltato"; errore?: string | null; subscription_id?: number | null; spegni?: boolean;
}) {
  try {
    await rpc("registra_invio_avviso", {
      p_avviso_id: p.avviso_id, p_canale: p.canale, p_utente_id: p.utente_id,
      p_destinazione: p.destinazione, p_esito: p.esito, p_errore: p.errore ?? null,
      p_subscription_id: p.subscription_id ?? null, p_spegni: !!p.spegni,
    });
  } catch (e) {
    console.error("registro:", (e as Error).message);
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function linkAvviso(id: number): string {
  return SITO_URL ? `${SITO_URL}#/avviso/${id}` : "";
}

function dataOra(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function descriviDispositivo(endpoint: string): string {
  try {
    const h = new URL(endpoint).host;
    if (h.includes("apple")) return "iPhone/Mac (Apple)";
    if (h.includes("google") || h.includes("fcm")) return "Android/Chrome";
    if (h.includes("mozilla")) return "Firefox";
    if (h.includes("windows") || h.includes("notify")) return "Edge/Windows";
    return h;
  } catch {
    return "dispositivo";
  }
}

async function inviaEmail(a: string, nome: string | null, oggetto: string, html: string, testo: string) {
  const r = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": BREVO_KEY },
    body: JSON.stringify({
      sender: { email: MITTENTE, name: MITTENTE_NOME },
      to: [{ email: a, name: nome || a }],
      subject: oggetto,
      htmlContent: html,
      textContent: testo,
    }),
  });
  if (!r.ok) throw new Error(`Brevo HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

function paginaEmail(titolo: string, corpo: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b28">
<div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#075b4c;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;font-size:16px">${esc(titolo)}</div>
<div style="background:#fff;padding:18px;border-radius:0 0 8px 8px;font-size:15px;line-height:1.45">${corpo}</div>
<div style="font-size:12px;color:#6b7b77;padding:10px 4px">Messaggio automatico del gestionale TOLI Fire. Non rispondere a questa email.</div>
</div></body></html>`;
}

// ── Avviso urgente ────────────────────────────────────────────────────
async function inviaUrgente(avvisoId: number) {
  const d = await rpc("dati_invio_avviso_urgente", { p_avviso_id: avvisoId });
  if (!d || d.errore) return { esito: "saltato", motivo: d?.errore || "nessun dato" };
  const a = d.avviso;
  if (!a.urgente || a.stato !== "aperto") return { esito: "saltato", motivo: "avviso non urgente o già chiuso" };
  const destinatari: Destinatario[] = d.destinatari || [];
  const link = linkAvviso(a.id);
  const titolo = (a.prova ? "🧪 " : "🚨 ") + "TOLI Fire – Avviso urgente";
  const lavori: Promise<unknown>[] = [];
  let notifiche = 0, email = 0;

  for (const p of destinatari) {
    // notifiche
    for (const s of p.dispositivi || []) {
      if (!d.push_attivo) continue;
      if (!pushPronto) {
        lavori.push(registra({ avviso_id: a.id, canale: "push", utente_id: p.utente_id, destinazione: descriviDispositivo(s.endpoint),
          esito: "saltato", errore: "Chiavi VAPID mancanti nei segreti della funzione", subscription_id: s.id }));
        continue;
      }
      const carico = JSON.stringify({ titolo, testo: a.testo, url: link, tag: "avviso-" + a.id, avviso_id: a.id, urgente: true });
      lavori.push(
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carico,
          { TTL: 6 * 3600, urgency: "high", topic: "avviso-" + a.id })
          .then(() => { notifiche++; return registra({ avviso_id: a.id, canale: "push", utente_id: p.utente_id,
            destinazione: descriviDispositivo(s.endpoint), esito: "inviato", subscription_id: s.id }); })
          .catch((e: any) => {
            const codice = e?.statusCode;
            return registra({ avviso_id: a.id, canale: "push", utente_id: p.utente_id, destinazione: descriviDispositivo(s.endpoint),
              esito: "errore", errore: `HTTP ${codice ?? "?"} ${String(e?.body || e?.message || e).slice(0, 300)}`,
              subscription_id: s.id, spegni: codice === 404 || codice === 410 });
          }),
      );
    }
    // email
    if (!d.email_attiva) continue;
    if (!p.email) {
      lavori.push(registra({ avviso_id: a.id, canale: "email", utente_id: p.utente_id, destinazione: null, esito: "saltato", errore: "Nessuna email in anagrafica" }));
      continue;
    }
    if (!emailPronta) {
      lavori.push(registra({ avviso_id: a.id, canale: "email", utente_id: p.utente_id, destinazione: p.email, esito: "saltato", errore: "BREVO_API_KEY o EMAIL_MITTENTE mancanti nei segreti della funzione" }));
      continue;
    }
    const html = paginaEmail(titolo,
      `<p>Ciao ${esc(p.nome || "")},</p><p style="font-size:17px"><b>${esc(a.testo)}</b></p>` +
      `<p style="color:#6b7b77;font-size:13px">Avviso n. ${a.id} del ${esc(dataOra(a.creato_il))}</p>` +
      (link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#c0392b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">Apri l'avviso nel gestionale</a></p>` : ""));
    const testo = `${titolo}\n\n${a.testo}\n\nAvviso n. ${a.id} del ${dataOra(a.creato_il)}\n${link}`;
    lavori.push(
      inviaEmail(p.email, p.nome, (a.prova ? "[PROVA] " : "[URGENTE] ") + String(a.testo).slice(0, 120), html, testo)
        .then(() => { email++; return registra({ avviso_id: a.id, canale: "email", utente_id: p.utente_id, destinazione: p.email, esito: "inviato" }); })
        .catch((e: Error) => registra({ avviso_id: a.id, canale: "email", utente_id: p.utente_id, destinazione: p.email, esito: "errore", errore: e.message })),
    );
  }
  await Promise.allSettled(lavori);
  return { esito: "ok", destinatari: destinatari.length, notifiche, email };
}

// ── Riepilogo delle 8:00 ──────────────────────────────────────────────
async function inviaRiepilogo(utenteId: string | null) {
  const persone: { utente_id: string; nome: string | null; email: string; avvisi: AvvisoBreve[] }[] =
    (await rpc("dati_riepilogo_avvisi", { p_utente_id: utenteId })) || [];
  if (!emailPronta) {
    for (const p of persone) {
      await registra({ avviso_id: null, canale: "riepilogo", utente_id: p.utente_id, destinazione: p.email, esito: "saltato",
        errore: "BREVO_API_KEY o EMAIL_MITTENTE mancanti nei segreti della funzione" });
    }
    return { esito: "saltato", persone: persone.length };
  }
  let inviate = 0;
  const oggi = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });
  await Promise.allSettled(persone.map(async (p) => {
    const n = p.avvisi.length;
    const righe = p.avvisi.slice(0, 50).map((a) => {
      const l = linkAvviso(a.id);
      const scad = a.scadenza ? ` <span style="color:#6b7b77">(scadenza ${esc(dataOra(a.scadenza))})</span>` : "";
      return `<li style="margin:0 0 8px">${a.urgente ? "🚨 " : ""}${l ? `<a href="${esc(l)}" style="color:#075b4c">${esc(a.testo)}</a>` : esc(a.testo)}${scad}</li>`;
    }).join("");
    const html = paginaEmail(`Riepilogo avvisi – ${oggi}`,
      `<p>Ciao ${esc(p.nome || "")}, hai <b>${n}</b> ${n === 1 ? "avviso aperto" : "avvisi aperti"} nel gestionale:</p><ul style="padding-left:18px">${righe}</ul>` +
      (n > 50 ? `<p>… e altri ${n - 50}: aprili dalla campanella 🔔 del gestionale.</p>` : "") +
      (SITO_URL ? `<p><a href="${esc(SITO_URL)}" style="color:#075b4c">Apri il gestionale</a></p>` : ""));
    const testo = `Riepilogo avvisi – ${oggi}\n\n` + p.avvisi.slice(0, 50).map((a) => `- ${a.urgente ? "[URGENTE] " : ""}${a.testo} ${linkAvviso(a.id)}`).join("\n");
    try {
      await inviaEmail(p.email, p.nome, `Gestionale TOLI Fire: ${n} ${n === 1 ? "avviso aperto" : "avvisi aperti"}`, html, testo);
      inviate++;
      await registra({ avviso_id: null, canale: "riepilogo", utente_id: p.utente_id, destinazione: p.email, esito: "inviato" });
    } catch (e) {
      await registra({ avviso_id: null, canale: "riepilogo", utente_id: p.utente_id, destinazione: p.email, esito: "errore", errore: (e as Error).message });
    }
  }));
  return { esito: "ok", persone: persone.length, inviate };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return risposta(405, { errore: "Solo POST" });
  if (!SEGRETO || !uguali(req.headers.get("x-toli-segreto") || "", SEGRETO)) return risposta(401, { errore: "Chiave non valida" });
  if (!SUPABASE_URL || !SERVICE_KEY) return risposta(500, { errore: "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti" });
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return risposta(400, { errore: "Corpo non valido" });
  }
  try {
    if (corpo?.modo === "urgente" && Number.isInteger(Number(corpo.avviso_id))) {
      return risposta(200, await inviaUrgente(Number(corpo.avviso_id)));
    }
    if (corpo?.modo === "riepilogo") {
      const u = typeof corpo.utente_id === "string" && /^[0-9a-f-]{36}$/i.test(corpo.utente_id) ? corpo.utente_id : null;
      return risposta(200, await inviaRiepilogo(u));
    }
    return risposta(400, { errore: "modo non previsto" });
  } catch (e) {
    console.error(e);
    return risposta(500, { errore: (e as Error).message });
  }
});
