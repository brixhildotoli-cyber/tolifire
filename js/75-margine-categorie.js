// ── F16.48 — MARGINE PER CATEGORIA DI VOCI: AVVISO GIALLO SOTTO IL 20% ──
// Decisione di Toli E3: un gruppo di voci sotto il 20% di margine è SOLO un
// avviso (nessun blocco). Versione del 13/11 decisa da Erika, NESSUN SQL:
//   - gruppo = categoria della voce (materiale, manodopera, nolo, trasporto,
//     servizio, altro): le voci a gruppi di F16.15 e i modelli non si fanno;
//   - margine = (prezzo cliente - costo interno) / prezzo cliente, PRIMA della
//     provvigione (la provvigione è dei prezzi di F16.1, rimandati);
//   - soglia fissa SOGLIA_MARGINE_CATEGORIA = 20 (metterla nelle Regole del
//     titolare richiede una riga SQL: da fare con i prezzi).
// Dove: riquadro "📊 Margine per categoria" sotto i totali nell'editor delle
// voci (pvv-margine-gruppi, js/18), righe gialle sotto la soglia; generando
// il PDF del cliente un avviso (il PDF esce comunque); al titolare la riga di
// "Cosa tocca a me" "Preventivi con una categoria sotto il 20%" sui
// preventivi di Acquisti da controllare. Ruoli: chi vede l'editor delle voci
// (Acquisti, titolare).

const SOGLIA_MARGINE_CATEGORIA = 20;
const NOMI_CATEGORIA_VOCE = { materiale: 'Materiale', manodopera: 'Manodopera', nolo: 'Nolo', trasporto: 'Trasporto', servizio: 'Servizio', altro: 'Altro' };

function margineCategorieVoci(voci) {
  const per = {};
  (voci || []).forEach(function(v) {
    const c = v.categoria || 'altro';
    const q = Number(v.quantita) || 0;
    if (!per[c]) per[c] = { categoria: c, costo: 0, vendita: 0 };
    per[c].costo += q * (Number(v.costo_unitario) || 0);
    per[c].vendita += q * (Number(v.prezzo_unitario) || 0);
  });
  return Object.keys(per).map(function(c) {
    const g = per[c];
    g.perc = g.vendita > 0 ? ((g.vendita - g.costo) / g.vendita) * 100 : (g.costo > 0 ? -100 : null);
    g.sotto = g.perc !== null && g.perc < SOGLIA_MARGINE_CATEGORIA;
    return g;
  }).filter(function(g) { return g.costo > 0 || g.vendita > 0; })
    .sort(function(a, b) { return (b.vendita - a.vendita); });
}

function categorieSottoSoglia(voci) {
  return margineCategorieVoci(voci).filter(function(g) { return g.sotto; });
}

function htmlMargineCategoriePreventivo(voci) {
  const gruppi = margineCategorieVoci(voci);
  if (gruppi.length < 2 && !gruppi.some(function(g) { return g.sotto; })) return '';
  const euro = typeof euroPreventivo === 'function' ? euroPreventivo : function(n) { return (Number(n) || 0).toFixed(2) + ' €'; };
  const sotto = gruppi.filter(function(g) { return g.sotto; });
  return '<div style="margin-top:12px;padding:10px 12px;border:1px solid var(--bo);border-radius:8px">' +
    '<div style="font-size:13px;font-weight:700;margin-bottom:6px">📊 Margine per categoria</div>' +
    gruppi.map(function(g) {
      const stile = g.sotto ? 'background:#FEF3C7;color:#854F0B;font-weight:600' : '';
      return '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:4px 6px;border-radius:6px;font-size:13px;' + stile + '">' +
        '<span>' + (g.sotto ? '⚠️ ' : '') + esc(NOMI_CATEGORIA_VOCE[g.categoria] || g.categoria) + '</span>' +
        '<span>costo ' + euro(g.costo) + ' · cliente ' + euro(g.vendita) + ' · <b>' + (g.perc === null ? '—' : g.perc.toFixed(1) + '%') + '</b></span></div>';
    }).join('') +
    (sotto.length ? '<div style="font-size:12px;color:#854F0B;margin-top:6px">Sotto il ' + SOGLIA_MARGINE_CATEGORIA + '% di margine: è solo un avviso, il preventivo si può inviare. Il titolare lo vede tra i preventivi da controllare.</div>' : '') +
    '</div>';
}

function aggiornaMargineCategoriePreventivo() {
  const box = ge('pvv-margine-gruppi');
  if (box && typeof vociPreventivoDati !== 'undefined') box.innerHTML = htmlMargineCategoriePreventivo(vociPreventivoDati);
}

// PDF del cliente: avviso (il PDF esce comunque), solo con le voci dell'editor
if (typeof generaPreventivoClientePDF === 'function') {
  const generaPreventivoClientePDFSenzaMargine = generaPreventivoClientePDF;
  // eslint-disable-next-line no-global-assign
  generaPreventivoClientePDF = async function(datiEsterni) {
    const esito = await generaPreventivoClientePDFSenzaMargine.apply(this, arguments);
    try {
      if (!datiEsterni && typeof vociPreventivoDati !== 'undefined' && (ROLE === 'commerciale' || ROLE === 'titolare')) {
        const sotto = categorieSottoSoglia(vociPreventivoDati);
        if (sotto.length) {
          toast('⚠️ Margine sotto il ' + SOGLIA_MARGINE_CATEGORIA + '% in: ' + sotto.map(function(g) {
            return (NOMI_CATEGORIA_VOCE[g.categoria] || g.categoria) + ' ' + (g.perc === null ? '' : g.perc.toFixed(1) + '%');
          }).join(', ') + '. Il PDF è fatto; il titolare lo vede tra i preventivi da controllare.', 'err');
        }
      }
    } catch (e) { console.warn('Margine per categoria:', e); }
    return esito;
  };
}

// Titolare: preventivi di Acquisti da controllare con una categoria sotto la soglia
async function preventiviConCategoriaSottoSoglia() {
  const { data: prev, error } = await db.from('preventivi').select('id')
    .not('inviato_a_titolare_il', 'is', null).is('letto_titolare_il', null)
    .not('preventivo_cliente_pdf_path', 'is', null).limit(200);
  if (error) return null;
  const ids = (prev || []).map(function(p) { return p.id; });
  if (!ids.length) return [];
  const { data: voci, error: e2 } = await db.from('preventivi_voci')
    .select('preventivo_id,categoria,quantita,costo_unitario,prezzo_unitario').in('preventivo_id', ids);
  if (e2) return null;
  const per = {};
  (voci || []).forEach(function(v) { (per[v.preventivo_id] = per[v.preventivo_id] || []).push(v); });
  return ids.filter(function(id) { return categorieSottoSoglia(per[id] || []).length > 0; });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'preventivi-categoria-sotto-soglia', ruoli: ['titolare'], icona: '📊',
    titolo: 'Preventivi con una categoria sotto il ' + SOGLIA_MARGINE_CATEGORIA + '% di margine',
    vai: { pagina: 'preventivi-titolare' },
    conta: async function() {
      const elenco = await preventiviConCategoriaSottoSoglia();
      return elenco === null ? null : elenco.length;
    }
  });
}
