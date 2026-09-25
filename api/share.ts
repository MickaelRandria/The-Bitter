/**
 * Page publique d'un lien « voir ensemble » ou « ton avis ? » : thebitter.watch/i/:jeton
 *
 * Servie par Vercel et non par l'app, pour deux raisons :
 * - WhatsApp, Messenger et les SMS n'exécutent pas JavaScript : l'aperçu du lien
 *   (titre, affiche) doit être dans le HTML envoyé, sinon la carte reste vide ;
 * - la personne qui reçoit le lien n'a pas de compte. Charger toute l'app, son
 *   écran d'accueil et sa fenêtre de consentement pour un seul geste la perdrait.
 *
 * La page ne lit que ce que `get_share_link` accepte de montrer sans compte : le
 * prénom de la personne qui invite et la fiche du film. Sa note n'arrive qu'après
 * que l'invité a donné la sienne, par `answer_share_link`, côté navigateur.
 */
export const config = { runtime: 'edge' };

// Valeurs publiques par nature : elles sont déjà dans le JavaScript de l'app. Les
// variables d'environnement passent d'abord, nettoyées : un retour à la ligne
// collé dans le tableau de bord Vercel rend l'en-tête HTTP invalide, et le
// `fetch` de l'environnement edge ne dit alors rien d'autre que « internal error ».
const FALLBACK_URL = 'https://tnvnmsevddvcklkitnpa.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudm5tc2V2ZGR2Y2tsa2l0bnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDgwMTMsImV4cCI6MjA4NTk4NDAxM30.cQi9F7ECVNOk8h8JYoCWATqV3XUwjL4qE_8FQeisHXk';
const clean = (value: string | undefined) => (value || '').replace(/\s+/g, '');
const SUPABASE_URL = clean(process.env.VITE_SUPABASE_URL).replace(/\/+$/, '') || FALLBACK_URL;
const SUPABASE_ANON_KEY = clean(process.env.VITE_SUPABASE_ANON_KEY) || FALLBACK_KEY;
const SITE = 'https://thebitter.watch';

interface LinkPreview {
  kind: 'watch' | 'verdict';
  inviter: string;
  title: string;
  year: number | null;
  media_type: 'movie' | 'tv';
  poster_url: string | null;
  backdrop_url: string | null;
  runtime: number | null;
  release_date: string | null;
  expired: boolean;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Seules les images TMDB passent : la valeur finit dans un attribut et une balise meta. */
const tmdbImage = (url: string | null, size: string): string | null => {
  if (!url || !/^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[A-Za-z0-9_.-]+$/.test(url)) return null;
  return url.replace(/\/t\/p\/[a-z0-9]+\//, `/t/p/${size}/`);
};

const formatRuntime = (minutes: number | null) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
};

const formatRelease = (date: string | null) => {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  if (ageDays < 0) return `Sortie le ${label}`;
  if (ageDays < 60) return `En salle depuis le ${label.replace(/ \d{4}$/, '')}`;
  return null;
};

const callGetShareLink = (base: string, key: string, token: string) =>
  fetch(`${base}/rest/v1/rpc/get_share_link`, {
    method: 'POST',
    // `apikey` seul : il suffit à PostgREST, et vaut pour l'ancienne clé JWT comme
    // pour la nouvelle clé publique, qu'on ne peut pas envoyer en `Bearer`.
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });

interface Found {
  link: LinkPreview;
  /** Le projet qui a répondu : la page y enverra aussi la réponse de l'invité. */
  base: string;
  key: string;
}

const readFrom = async (base: string, key: string, token: string): Promise<Found | null> => {
  try {
    const res = await callGetShareLink(base, key, token);
    if (!res.ok) {
      console.warn('[share] get_share_link a répondu', base, res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data && typeof data === 'object' ? { link: data as LinkPreview, base, key } : null;
  } catch (error) {
    console.warn('[share] appel impossible', base, String(error));
    return null;
  }
};

/**
 * La configuration du déploiement d'abord, le projet de production ensuite.
 *
 * Les prévisualisations Vercel pointent vers un autre projet Supabase que la
 * production : un lien créé en prod doit pourtant s'y ouvrir. Et la page doit
 * écrire dans le projet où elle a lu, sinon la réponse part dans le vide.
 */
const fetchLink = async (token: string): Promise<Found | null> =>
  (await readFrom(SUPABASE_URL, SUPABASE_ANON_KEY, token)) ??
  (SUPABASE_URL !== FALLBACK_URL ? await readFrom(FALLBACK_URL, FALLBACK_KEY, token) : null);

const STYLE = `
:root{--cream:#FDFCF8;--charcoal:#1A1A1A;--forest:#3E5238;--lime:#D9FF00;
  --ground:var(--cream);--surface:#FFFFFF;--ink:var(--charcoal);--ink-2:#4A4A46;--muted:#8A8A82;
  --line:#E7E4DC;--accent:var(--forest);--on-accent:#FFFFFF;--soft:#F2EFE9}
@media (prefers-color-scheme:dark){:root{--ground:#0C0C0C;--surface:#161616;--ink:#F5F5F0;--ink-2:#C8C8C0;
  --muted:#8A8A82;--line:#262626;--accent:var(--lime);--on-accent:#1A1A1A;--soft:#1E1E1E}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--ground);color:var(--ink)}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:30rem;margin:0 auto;padding:1.25rem 1rem 3rem}
.brand{font-size:.7rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);text-decoration:none}
.hero{margin-top:1.25rem;display:flex;gap:1rem;align-items:flex-end}
.poster{width:7.5rem;aspect-ratio:2/3;border-radius:1rem;object-fit:cover;background:var(--soft);flex:none;box-shadow:0 12px 30px rgba(0,0,0,.18)}
.who{font-size:.75rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 .4rem}
h1{font-size:1.6rem;line-height:1.15;font-weight:900;letter-spacing:-.02em;margin:0;text-wrap:balance}
.meta{color:var(--muted);font-size:.85rem;margin:.5rem 0 0}
.card{margin-top:1.5rem;background:var(--surface);border:1px solid var(--line);border-radius:1.5rem;padding:1.25rem}
.q{font-weight:800;font-size:1.05rem;margin:0 0 1rem}
.row{display:flex;gap:.6rem}
button,.btn{appearance:none;border:0;border-radius:999px;padding:.95rem 1.2rem;font:inherit;font-weight:900;font-size:.95rem;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%}
.primary{background:var(--accent);color:var(--on-accent)}
.ghost{background:var(--soft);color:var(--ink)}
button:disabled{opacity:.5;cursor:default}
label{display:block;font-size:.8rem;font-weight:800;color:var(--ink-2);margin:0 0 .4rem}
input[type=text]{width:100%;font:inherit;font-size:1rem;padding:.85rem 1rem;border-radius:1rem;border:1px solid var(--line);background:var(--ground);color:var(--ink);margin-bottom:.9rem}
input[type=range]{width:100%;accent-color:var(--accent);margin:.25rem 0 1rem}
.score{font-size:2.6rem;font-weight:900;letter-spacing:-.03em;text-align:center;margin:.2rem 0}
.hint{color:var(--muted);font-size:.8rem;margin:.75rem 0 0;text-align:center}
.done{font-weight:800;margin:0 0 .25rem}
.reveal{display:flex;gap:.75rem;margin:.5rem 0 1rem}
.side{flex:1;background:var(--soft);border-radius:1rem;padding:.8rem;text-align:center}
.side b{display:block;font-size:2rem;font-weight:900;letter-spacing:-.03em}
.side span{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.crit{display:grid;grid-template-columns:5.5rem 1fr 2rem;gap:.5rem;align-items:center;font-size:.8rem;color:var(--ink-2);margin:.3rem 0}
.bar{height:.4rem;border-radius:999px;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
.cta h2{font-size:1.15rem;font-weight:900;margin:0 0 .4rem;letter-spacing:-.01em}
.cta p{color:var(--ink-2);margin:0 0 1rem;font-size:.95rem}
.small{font-size:.75rem;color:var(--muted);text-align:center;margin:.6rem 0 0}
.err{color:#B3261E;font-size:.85rem;margin:.5rem 0 0}
[hidden]{display:none!important}
`;

const SCRIPT = `
(function(){
  var S = window.__LINK__;
  var API = S.api, KEY = S.key, TOKEN = S.token;
  var $ = function(id){ return document.getElementById(id); };
  var val = function(id){ var el = $(id); return el ? (el.value || '').trim() : ''; };
  var show = function(id){ ['ask','name','rate','sent','declined','reveal','notseen'].forEach(function(s){ var el=$(s); if(el) el.hidden = (s!==id); }); };
  var store = function(k,v){ try{ localStorage.setItem(k,v); }catch(e){} };
  var read = function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  var guest = read('bitter_guest_key');
  if(!guest){ guest = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g,function(){return (Math.random()*16|0).toString(16);}); store('bitter_guest_key', guest); }
  var loggedIn = false;
  try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(/^sb-.*-auth-token$/.test(k)){ loggedIn = true; } } }catch(e){}
  var appUrl = '/?invite=' + encodeURIComponent(TOKEN);
  // L'invitation n'est gardée qu'au geste « continuer » : quelqu'un qui a dit non
  // et ouvre l'app plus tard pour autre chose ne doit pas se retrouver dans un
  // espace avec la personne qui l'avait invité. L'app la reprendra même si
  // l'inscription se fait plus tard dans ce navigateur.
  Array.prototype.forEach.call(document.querySelectorAll('[data-app]'), function(a){
    a.href = appUrl;
    a.addEventListener('click', function(){ store('bitter_pending_invite', JSON.stringify({ token: TOKEN, guestKey: guest, at: Date.now() })); });
  });
  if(loggedIn){ $('open').hidden = false; }

  var rpc = function(fn, body){
    return fetch(API + '/rest/v1/rpc/' + fn, { method:'POST', headers:{ apikey:KEY, 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error((j && j.message) || 'erreur'); return j; }); });
  };
  var fmt = function(n){ if(n===null||n===undefined) return '–'; var v=Math.round(Number(n)*10)/10; return (v%1===0?String(v):v.toFixed(1)).replace('.',','); };
  var answer = { interested:null, rating:null };

  var renderReveal = function(mine, theirs){
    $('mine').textContent = fmt(mine);
    $('theirs').textContent = fmt(theirs && theirs.overall);
    var labels = { story:'Scénario', visuals:'Image', acting:'Jeu', sound:'Son' };
    var html = '';
    if(theirs){ ['story','visuals','acting','sound'].forEach(function(k){ var v = Number(theirs[k]||0); html += '<div class="crit"><span>'+labels[k]+'</span><div class="bar"><i style="width:'+(v*10)+'%"></i></div><b>'+fmt(v)+'</b></div>'; }); }
    $('crits').innerHTML = html;
    var gap = theirs ? Math.abs(Number(mine) - Number(theirs.overall)) : 0;
    $('verdict').textContent = gap <= 1 ? 'Vous êtes d’accord.' : gap <= 2 ? 'Presque d’accord.' : gap <= 3.5 ? 'Pas tout à fait d’accord.' : 'Vous n’avez pas vu le même film.';
    show('reveal');
  };

  var send = function(btn){
    var name = answer.rating !== null ? val('rateName') : val('nameInput');
    var err = btn.parentNode.querySelector('.err');
    if(!name){ if(err){ err.textContent = 'Ton prénom, pour que ' + S.inviter + ' sache que c’est toi.'; err.hidden=false; } return; }
    btn.disabled = true;
    rpc('answer_share_link', { p_token:TOKEN, p_guest_key:guest, p_name:name, p_interested:answer.interested, p_rating:answer.rating })
      .then(function(res){
        store('bitter_guest_name', name);
        if(answer.rating !== null){ renderReveal(answer.rating, res.inviter_rating); }
        else { show('sent'); }
      })
      .catch(function(e){ btn.disabled = false; if(err){ err.textContent = /expired/.test(e.message) ? 'Ce lien a expiré.' : 'L’envoi a échoué. Réessaie.'; err.hidden=false; } });
  };

  var remembered = read('bitter_guest_name');
  if(remembered){ ['nameInput','rateName'].forEach(function(id){ if($(id)) $(id).value = remembered; }); }

  $('yes') && $('yes').addEventListener('click', function(){ answer.interested = true; show('name'); $('nameInput').focus(); });
  $('no') && $('no').addEventListener('click', function(){
    rpc('answer_share_link', { p_token:TOKEN, p_guest_key:guest, p_name:'', p_interested:false }).catch(function(){});
    show('declined');
  });
  $('seen') && $('seen').addEventListener('click', function(){ answer.rating = 7; show('rate'); });
  $('notSeen') && $('notSeen').addEventListener('click', function(){ show('notseen'); });
  $('notSeenYes') && $('notSeenYes').addEventListener('click', function(){ answer.interested = true; answer.rating = null; show('name'); $('nameInput').focus(); });
  $('notSeenNo') && $('notSeenNo').addEventListener('click', function(){ show('declined'); });
  var slider = $('slider');
  if(slider){ slider.addEventListener('input', function(){ answer.rating = Number(slider.value); $('score').textContent = fmt(answer.rating); }); }
  $('sendName').addEventListener('click', function(){ send($('sendName')); });
  $('sendRate') && $('sendRate').addEventListener('click', function(){ answer.rating = Number(slider.value); send($('sendRate')); });

  // Retour sur la page : on reprend là où la personne s'était arrêtée.
  rpc('get_share_link', { p_token:TOKEN, p_guest_key:guest }).then(function(d){
    if(!d || !d.response) return;
    var r = d.response;
    if(r.rating !== null && r.rating !== undefined){ renderReveal(r.rating, d.inviter_rating); }
    else if(r.interested){ show('sent'); }
  }).catch(function(){});
})();
`;

const notFound = () =>
  new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lien introuvable · The Bitter</title><meta name="robots" content="noindex"><style>${STYLE}</style></head><body><main class="wrap"><a class="brand" href="/">The Bitter</a><div class="card"><p class="q">Ce lien n’existe pas, ou plus.</p><p style="color:var(--ink-2);margin:0 0 1rem">Il a peut-être été mal copié. Demande à la personne de te le renvoyer.</p><a class="btn ghost" href="/">Découvrir The Bitter</a></div></main></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Derrière la réécriture `/i/:token`, Vercel transmet l'adresse d'origine :
  // le jeton est alors dans le chemin, pas dans la requête.
  const token = url.searchParams.get('token') || url.pathname.match(/\/i\/([A-Za-z0-9_-]{22})\/?$/)?.[1] || '';
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) {
    console.warn('[share] jeton illisible', url.pathname, url.search);
    return notFound();
  }

  const found = await fetchLink(token);
  if (!found) return notFound();
  const { link } = found;

  const inviter = link.inviter || 'Quelqu’un';
  const isVerdict = link.kind === 'verdict';
  const poster = tmdbImage(link.poster_url, 'w342');
  const ogImage = tmdbImage(link.backdrop_url, 'w1280') || tmdbImage(link.poster_url, 'w780');
  const release = link.media_type === 'movie' ? formatRelease(link.release_date) : null;
  const meta = [link.media_type === 'tv' ? 'Série' : null, link.year, formatRuntime(link.runtime), release]
    .filter(Boolean)
    .join(' · ');

  const ogTitle = isVerdict ? `${inviter} a noté ${link.title}. Et toi ?` : `${inviter} veut voir ${link.title} avec toi`;
  const ogDescription = isVerdict
    ? 'Donne ta note pour découvrir la sienne. Sans compte.'
    : [release, 'Réponds en un clic, sans compte.'].filter(Boolean).join(' · ');
  const e = escapeHtml;

  const expiredBlock = `<div class="card"><p class="q">Ce lien a expiré.</p><p style="color:var(--ink-2);margin:0 0 1rem">Demande à ${e(inviter)} de t’en renvoyer un.</p><a class="btn ghost" href="/">Découvrir The Bitter</a></div>`;

  const cta = `
    <div class="card cta">
      <h2>${isVerdict ? `Vous êtes d’accord sur quoi, ${e(inviter)} et toi ?` : `Garde ce film avec ${e(inviter)}`}</h2>
      <p>${
        isVerdict
          ? 'Crée ton compte : ta note est gardée, et vous comparez vos goûts sur tous les films que vous notez.'
          : 'Retrouvez-le dans votre liste commune, notez-le chacun après la séance et comparez vos verdicts.'
      }</p>
      <a class="btn primary" data-app href="/">${isVerdict ? 'Comparer nos goûts' : `Continuer avec ${e(inviter)}`}</a>
      <p class="small">Gratuit · connexion par code e-mail, sans mot de passe</p>
    </div>`;

  const nameBlock = `
    <div class="card" id="name" hidden>
      <label for="nameInput">Ton prénom, pour que ${e(inviter)} sache que c’est toi</label>
      <input type="text" id="nameInput" maxlength="30" autocomplete="given-name" enterkeyhint="send">
      <button class="primary" id="sendName">Envoyer</button>
      <p class="err" hidden></p>
    </div>`;

  const watchBlocks = `
    <div class="card" id="ask">
      <p class="q">Ça te dit ?</p>
      <div class="row"><button class="primary" id="yes">Ça me dit</button><button class="ghost" id="no">Pas cette fois</button></div>
    </div>
    ${nameBlock}
    <div id="sent" hidden>
      <div class="card"><p class="done">C’est dit.</p><p style="color:var(--ink-2);margin:0">${e(inviter)} vient de recevoir ta réponse.</p></div>
      ${cta}
    </div>
    <div class="card" id="declined" hidden>
      <p class="done">Pas de souci.</p>
      <p style="color:var(--ink-2);margin:0 0 1rem">${e(inviter)} ne recevra rien.</p>
      <a class="btn ghost" href="/">Découvrir The Bitter</a>
    </div>`;

  const verdictBlocks = `
    <div class="card" id="ask">
      <p class="q">${e(inviter)} a noté ce film. Tu l’as vu ?</p>
      <div class="row"><button class="primary" id="seen">Je l’ai vu</button><button class="ghost" id="notSeen">Pas encore</button></div>
      <p class="hint">Sa note reste cachée tant que tu n’as pas donné la tienne.</p>
    </div>
    <div class="card" id="rate" hidden>
      <p class="q">Ta note</p>
      <div class="score" id="score">7</div>
      <input type="range" id="slider" min="0" max="10" step="0.5" value="7" aria-label="Ta note sur 10">
      <label for="rateName">Ton prénom</label>
      <input type="text" id="rateName" maxlength="30" autocomplete="given-name">
      <button class="primary" id="sendRate">Découvrir sa note</button>
      <p class="err" hidden></p>
    </div>
    <div id="reveal" hidden>
      <div class="card">
        <div class="reveal"><div class="side"><span>Toi</span><b id="mine">–</b></div><div class="side"><span>${e(inviter)}</span><b id="theirs">–</b></div></div>
        <p class="done" id="verdict"></p>
        <div id="crits"></div>
      </div>
      ${cta}
    </div>
    <div class="card" id="notseen" hidden>
      <p class="q">Tu veux le voir avec ${e(inviter)} ?</p>
      <div class="row"><button class="primary" id="notSeenYes">Ça me dit</button><button class="ghost" id="notSeenNo">Non merci</button></div>
    </div>
    ${nameBlock}
    <div id="sent" hidden>
      <div class="card"><p class="done">C’est dit.</p><p style="color:var(--ink-2);margin:0">${e(inviter)} sait que ça te dit.</p></div>
      ${cta}
    </div>
    <div class="card" id="declined" hidden>
      <p class="done">Pas de souci.</p>
      <a class="btn ghost" href="/">Découvrir The Bitter</a>
    </div>`;

  const state = JSON.stringify({ token, inviter, api: found.base, key: found.key }).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(ogTitle)}</title>
<meta name="description" content="${e(ogDescription)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Bitter">
<meta property="og:title" content="${e(ogTitle)}">
<meta property="og:description" content="${e(ogDescription)}">
<meta property="og:url" content="${SITE}/i/${token}">
${ogImage ? `<meta property="og:image" content="${e(ogImage)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#1A1A1A">
<link rel="icon" href="/favicon_io/favicon.ico">
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
  <a class="brand" href="/">The Bitter</a>
  <div class="hero">
    ${poster ? `<img class="poster" src="${e(poster)}" alt="">` : ''}
    <div>
      <p class="who">${isVerdict ? `${e(inviter)} a noté` : `${e(inviter)} veut le voir avec toi`}</p>
      <h1>${e(link.title)}</h1>
      ${meta ? `<p class="meta">${e(meta)}</p>` : ''}
    </div>
  </div>
  <a class="btn ghost" id="open" data-app href="/" style="margin-top:1rem" hidden>Ouvrir dans The Bitter</a>
  ${link.expired ? expiredBlock : isVerdict ? verdictBlocks : watchBlocks}
</main>
${link.expired ? '' : `<script>window.__LINK__=${state};</script><script>${SCRIPT}</script>`}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Court : l'expiration du lien doit se voir vite. La page ne porte rien de personnel.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
