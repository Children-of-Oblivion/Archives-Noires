(function () {
  /* ====== RÉGLAGES ====== */
  var SITE_PUBLIC_URL = "https://children-of-oblivion.github.io/COO/";
  var SESSION_SECONDES = 300;
  var ESSAIS_MAX = 3;
  var VERROU_SECONDES = 30;
  var CLE_FIN = 'coo_an_fin';

  var PAGE = document.body.getAttribute('data-page');          /* '4', '5' ou 'o' */
  var CLE = PAGE === '5' ? 'n5' : (PAGE === 'o' ? 'o' : null);
  var PREMIERE = { n5: 'n501', o: 'o00' };
  var PORTE = { n5: 'gate-n5', o: 'gate-o' };
  var LIBELLE_PAGE = { '4': 'Niveau 4', '5': 'Niveau 5', 'o': 'Niveau O' };

  var mem = {};
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };
  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
  }
  /* Normalisation des codes : identique au script de fabrication */
  function normCode(s) {
    return norm(s).replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim()
      .replace(/[.!?;:,\s]+$/, '');
  }

  if (location.hash === '#acces') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  /* Identifiant opérateur, partagé avec le site public */
  var OP = (function () {
    try {
      var id = localStorage.getItem('coo_operator_id');
      if (!id) { id = 'OMBRE-' + Math.floor(1000 + Math.random() * 9000); localStorage.setItem('coo_operator_id', id); }
      return id;
    } catch (e) { return 'OMBRE-' + Math.floor(1000 + Math.random() * 9000); }
  })();
  document.querySelectorAll('[data-op]').forEach(function (el) { el.textContent = OP; });

  /* Filigrane */
  var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='380' height='230'>" +
    "<text x='30' y='125' transform='rotate(-24 190 115)' font-family='Courier New, monospace' font-size='15' fill='#28263a'>" +
    OP + " / copie tracée</text></svg>";
  document.documentElement.style.setProperty('--wm', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');

  document.getElementById('lien-public').href = SITE_PUBLIC_URL;
  document.getElementById('lien-public-pied').href = SITE_PUBLIC_URL;

  var vues = { fin: document.getElementById('porte-fin'), archive: document.getElementById('archive') };
  var pied = document.getElementById('pied');
  var timerEl = document.getElementById('timer');
  var sheet = document.getElementById('sheet');
  var nav = document.querySelector('.index');

  function montrer(nom) {
    Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); });
    pied.hidden = (nom !== 'archive');
    timerEl.hidden = (nom !== 'archive');
    document.querySelector('.levels').hidden = (nom !== 'archive');
  }

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ====== Session partagée entre les pages (fin = horodatage) ====== */
  function finSession() {
    var v = parseInt(store.get(CLE_FIN) || '0', 10);
    return v > Date.now() ? v : 0;
  }
  var tic;
  function afficherTemps() {
    var f = finSession();
    var restant = f ? Math.ceil((f - Date.now()) / 1000) : 0;
    if (restant < 0) restant = 0;
    var m = Math.floor(restant / 60), s = restant % 60;
    timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    timerEl.className = 'timer' + (restant <= 10 ? ' crit' : (restant <= 30 ? ' warn' : ''));
    return restant;
  }
  function lancerSession(neuve) {
    if (neuve || !finSession()) store.set(CLE_FIN, String(Date.now() + SESSION_SECONDES * 1000));
    clearInterval(tic);
    afficherTemps();
    tic = setInterval(function () { if (afficherTemps() <= 0) { clearInterval(tic); fermer(); } }, 1000);
  }

  /* ====== Niveau scellé de cette page ====== */
  var gabarit = CLE ? document.getElementById('grp-' + CLE).innerHTML : '';
  var ouvert = false;

  function b64(s) {
    var b = atob(s), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  async function dechiffrer(bloc, code) {
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey('raw', enc.encode(normCode(code)), 'PBKDF2', false, ['deriveKey']);
    var cle = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(bloc.salt), iterations: window.NIVEAUX.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(bloc.iv) }, cle, b64(bloc.ct));
    return JSON.parse(new TextDecoder().decode(clair));
  }
  function injecter(contenu) {
    var groupe = document.getElementById('grp-' + CLE);
    var html = '<h2>' + esc(groupe.querySelector('h2').textContent) + '</h2>';
    contenu.index.forEach(function (p) {
      html += '<button data-doc="' + esc(p.id) + '"><span class="ref">' + esc(p.ref) + '</span><span class="t">' + esc(p.t) + '</span></button>';
    });
    groupe.innerHTML = html;
    sheet.insertAdjacentHTML('beforeend', contenu.html);
    ouvert = true;
  }
  function reverrouiller() {
    if (!CLE) return;
    if (ouvert) {
      sheet.querySelectorAll('.doc').forEach(function (d) {
        if (d.id !== 'doc-' + PORTE[CLE]) d.parentNode.removeChild(d);
      });
    }
    document.getElementById('grp-' + CLE).innerHTML = gabarit;
    var champ = document.getElementById('code-' + CLE); if (champ) champ.value = '';
    var err = document.getElementById('err-' + CLE); if (err) err.textContent = '';
    ouvert = false;
  }
  function oublierCodes() { store.del('coo_an_code_n5'); store.del('coo_an_code_o'); }

  function fermer() {
    clearInterval(tic);
    store.del(CLE_FIN);
    oublierCodes();
    reverrouiller();
    montrer('fin');
    window.scrollTo(0, 0);
  }

  /* ====== Porte d'accès ====== */
  var echecs = 0, verrou = null;
  function majBouton(actif) { var b = document.getElementById('btn-' + CLE); if (b) b.disabled = !actif; }
  function lancerVerrou() {
    var err = document.getElementById('err-' + CLE);
    var fin = Date.now() + VERROU_SECONDES * 1000;
    majBouton(false);
    clearInterval(verrou);
    function t() {
      var reste = Math.ceil((fin - Date.now()) / 1000);
      if (reste <= 0) { clearInterval(verrou); echecs = 0; err.textContent = ''; majBouton(true); return; }
      err.textContent = 'Trop de tentatives consignées pour ' + OP + '. Verrou actif : ' + reste + ' s.';
    }
    t();
    verrou = setInterval(t, 500);
  }
  function brancherPorte() {
    var form = document.getElementById('form-' + CLE);
    var champ = document.getElementById('code-' + CLE);
    var err = document.getElementById('err-' + CLE);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!champ.value.trim()) { err.textContent = 'Aucun code saisi.'; return; }
      if (!window.crypto || !crypto.subtle || !window.NIVEAUX || !window.NIVEAUX[CLE]) {
        err.textContent = 'Canal indisponible sur ce navigateur ou cette adresse.';
        return;
      }
      majBouton(false);
      err.textContent = 'Vérification du sceau...';
      var contenu = null;
      try { contenu = await dechiffrer(window.NIVEAUX[CLE], champ.value); } catch (x) { contenu = null; }
      if (contenu) {
        store.set('coo_an_code_' + CLE, champ.value);
        injecter(contenu);
        echecs = 0; champ.value = ''; err.textContent = ''; majBouton(true);
        ouvrirPiece(PREMIERE[CLE], true);
        return;
      }
      echecs++;
      var restantes = ESSAIS_MAX - echecs;
      if (restantes <= 0) { lancerVerrou(); }
      else { err.textContent = 'Tentative consignée pour ' + OP + '. Restantes : ' + restantes; majBouton(true); }
      champ.select();
    });
  }
  if (CLE) brancherPorte();

  /* ====== Pièces ====== */
  function ouvrirPiece(id, depuisClic) {
    sheet.querySelectorAll('.doc').forEach(function (d) { d.hidden = true; });
    var doc = document.getElementById('doc-' + id);
    if (!doc) return;
    doc.hidden = false;
    nav.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-doc') === id ? 'true' : 'false');
    });
    if (!reduit) { sheet.classList.remove('enter'); void sheet.offsetWidth; sheet.classList.add('enter'); }
    if (depuisClic) {
      var rs = sheet.getBoundingClientRect();
      if (window.innerWidth <= 860) sheet.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
      else if (rs.top < 60) window.scrollTo({ top: window.pageYOffset + rs.top - 72, behavior: reduit ? 'auto' : 'smooth' });
      var t = doc.querySelector('.doc-title');
      var champ = doc.querySelector('input');
      if (champ) champ.focus({ preventScroll: true });
      else if (t) t.focus({ preventScroll: true });
    }
  }
  nav.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-doc]') : null;
    if (b) ouvrirPiece(b.getAttribute('data-doc'), true);
  });

  /* ====== Entrée dans la page ====== */
  function lumiere() {
    document.body.classList.remove('lit'); void document.body.offsetWidth; document.body.classList.add('lit');
  }
  async function entrer(neuve) {
    reverrouiller();
    montrer('archive');
    lancerSession(neuve);
    lumiere();
    if (!CLE) { ouvrirPiece('an00', false); return; }
    var code = store.get('coo_an_code_' + CLE);
    if (code && window.crypto && crypto.subtle && window.NIVEAUX && window.NIVEAUX[CLE]) {
      try { injecter(await dechiffrer(window.NIVEAUX[CLE], code)); ouvrirPiece(PREMIERE[CLE], false); return; }
      catch (x) { store.del('coo_an_code_' + CLE); }
    }
    ouvrirPiece(PORTE[CLE], false);
  }

  /* ====== Démarrage (page Niveau 4 uniquement) ====== */
  var LIGNES = [
    'Canal Niveau 4 ouvert.',
    'Opérateur : ' + OP,
    'Chaque pièce consultée porte votre identifiant.',
    'Durée de consultation : cinq minutes.',
    'Les pièces sont sur le bureau.'
  ];
  function demarrer() {
    var boot = document.getElementById('boot');
    var pre = document.getElementById('boot-text');
    var fini = false;
    function terminer() {
      if (fini) return; fini = true;
      boot.classList.add('fin');
      setTimeout(function () { boot.hidden = true; boot.classList.remove('fin'); }, reduit ? 0 : 500);
      entrer(true);
    }
    boot.onclick = terminer;
    boot.hidden = false;
    if (reduit) { pre.textContent = LIGNES.join('\n'); setTimeout(terminer, 900); return; }
    var li = 0, ci = 0, sortie = '';
    (function taper() {
      if (fini) return;
      if (li < LIGNES.length) {
        var l = LIGNES[li];
        if (ci <= l.length) { pre.textContent = sortie + l.slice(0, ci); ci++; setTimeout(taper, 18); }
        else { sortie += l + '\n'; li++; ci = 0; setTimeout(taper, 260); }
      } else { setTimeout(terminer, 650); }
    })();
  }

  document.getElementById('btn-rouvrir').addEventListener('click', function () {
    if (PAGE === '4') demarrer(); else location.href = 'index.html';
  });

  /* ====== Au chargement ====== */
  if (finSession()) entrer(false);
  else if (PAGE === '4') demarrer();
  else location.replace('index.html');
})();
