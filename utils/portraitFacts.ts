/**
 * Les constats du portrait « Ce que tes notes disent ».
 *
 * L'app trouve, Mistral écrit. Ce module calcule une dizaine de constats à partir
 * des notes, les classe par netteté et en garde trois, chacun avec son chiffre et
 * deux films qui le montrent. Le modèle ne fait que les mettre en phrases : il ne
 * peut rien affirmer que le chiffre affiché à côté ne soutienne.
 *
 * Les notes par critère ne viennent que des films notés en détail (voir
 * `criteriaOf`) : les colonnes plates recopient souvent la note globale, et un
 * calcul fait dessus conclurait que tous les critères comptent pareil.
 *
 * Module pur : l'appelant fournit les films déjà mis à plat.
 */
import { CRITERIA, CriterionKey } from './verdict';

export interface PortraitFilm {
  id: string;
  title: string;
  posterUrl?: string;
  /** Note finale affichée. */
  score: number;
  /** Les quatre critères, seulement si le film est noté en détail. */
  criteria: Record<CriterionKey, number> | null;
  runtime?: number;
  genre?: string;
  director?: string;
  /** Note du public (IMDb ou TMDB). */
  publicScore?: number;
  /** Date de visionnage, en millisecondes. */
  at: number;
}

export type FactKind = 'decisive' | 'length' | 'genrePublic' | 'public' | 'harshest' | 'recent' | 'director' | 'genre';
export type FactTone = 'lime' | 'orange' | 'blue';

export interface PortraitFact {
  kind: FactKind;
  /** Le grand chiffre, déjà mis en forme : « 8 sur 10 », « −1,4 pt ». */
  figure: string;
  tone: FactTone;
  /** Ce que le chiffre veut dire, en une ligne factuelle : c'est ce que le modèle reformule. */
  claim: string;
  /** Une phrase de secours, si le modèle ne répond pas. */
  fallback: string;
  /** Deux films qui le montrent, l'exemple puis l'exception ou un second exemple. */
  evidence: { id: string; title: string; posterUrl?: string; detail: string }[];
  /** Netteté du constat : plus c'est haut, plus il est sûr et marquant. */
  strength: number;
}

const LABEL: Record<CriterionKey, string> = { story: 'scénario', visuals: 'image', acting: 'jeu', sound: 'son' };
/** « le scénario », « l'image » : l'article qui va avec chaque critère. */
const WITH_ARTICLE: Record<CriterionKey, string> = { story: 'le scénario', visuals: "l'image", acting: 'le jeu des acteurs', sound: 'le son' };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f1(Math.abs(n))} pt`;
const hours = (min?: number) => (min ? `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}` : '');
const firstGenre = (g?: string) => (g || '').split(',')[0].trim();
const ev = (f: PortraitFilm, detail: string) => ({ id: f.id, title: f.title, posterUrl: f.posterUrl, detail });

/** Au-dessous, on ne tire pas de portrait : les moyennes ne veulent encore rien dire. */
export const MIN_FILMS = 10;

export function computeFacts(films: PortraitFilm[], now: number): PortraitFact[] {
  const rated = films.filter((f) => Number.isFinite(f.score) && f.score > 0);
  if (rated.length < MIN_FILMS) return [];
  const avg = mean(rated.map((f) => f.score));
  const facts: PortraitFact[] = [];
  const detailed = rated.filter((f) => f.criteria);

  // 1. Le critère qui décide : celui qui monte et descend avec la note finale.
  if (detailed.length >= 6) {
    const best = CRITERIA.map((key) => {
      const cm = mean(detailed.map((f) => f.criteria![key]));
      const moving = detailed.filter((f) => Math.abs(f.score - avg) >= 0.3);
      const agree = moving.filter((f) => Math.sign(f.criteria![key] - cm) === Math.sign(f.score - avg)).length;
      return { key, share: moving.length ? agree / moving.length : 0, n: moving.length, cm };
    }).sort((a, b) => b.share - a.share)[0];
    if (best.n >= 6 && best.share >= 0.7) {
      const outOf10 = Math.round(best.share * 10);
      const byCrit = [...detailed].sort((a, b) => b.criteria![best.key] - a.criteria![best.key]);
      const high = byCrit[0];
      const low = byCrit[byCrit.length - 1];
      facts.push({
        kind: 'decisive',
        figure: `${outOf10} sur 10`,
        tone: 'lime',
        claim: `Quand ta note de ${LABEL[best.key]} monte ou baisse, ta note finale suit, ${outOf10} fois sur 10 (${best.n} films).`,
        fallback: `C'est ${WITH_ARTICLE[best.key]} qui fait ta note.`,
        evidence: [
          ev(high, `${LABEL[best.key]} ${f1(high.criteria![best.key])} → ${f1(high.score)}`),
          ev(low, `${LABEL[best.key]} ${f1(low.criteria![best.key])} → ${f1(low.score)}`),
        ],
        strength: (best.share - 0.6) * 4,
      });
    }
  }

  // 2. Les films longs ou courts.
  const long = rated.filter((f) => (f.runtime ?? 0) >= 140);
  const short = rated.filter((f) => (f.runtime ?? 0) > 0 && (f.runtime ?? 0) <= 100);
  if (long.length >= 3 && short.length >= 3) {
    const gap = mean(long.map((f) => f.score)) - mean(short.map((f) => f.score));
    if (Math.abs(gap) >= 0.6) {
      const sorted = [...long].sort((a, b) => a.score - b.score);
      const example = gap < 0 ? sorted[0] : sorted[sorted.length - 1];
      const exception = gap < 0 ? sorted[sorted.length - 1] : sorted[0];
      const hasException = gap < 0 ? exception.score > avg + 0.5 : exception.score < avg - 0.5;
      const second = hasException ? exception : (gap < 0 ? sorted[1] : sorted[sorted.length - 2]);
      facts.push({
        kind: 'length',
        figure: signed(gap),
        tone: gap < 0 ? 'orange' : 'lime',
        claim: `Tes films de 2h20 et plus ont une note ${gap < 0 ? 'inférieure' : 'supérieure'} de ${f1(Math.abs(gap))} point à tes films de 1h40 et moins.`,
        fallback: gap < 0 ? "Au-delà de 2h20, un film te coûte des points." : 'Plus un film est long, plus il te tient.',
        evidence: [
          ev(example, `${hours(example.runtime)} · ${f1(example.score)}`),
          ev(second, `${hours(second.runtime)} · ${f1(second.score)}${hasException ? ', l’exception' : ''}`),
        ],
        strength: Math.abs(gap) / 0.8,
      });
    }
  }

  // 3. Un genre où l'on n'est pas d'accord avec le public.
  const withPublic = rated.filter((f) => (f.publicScore ?? 0) > 0);
  const byGenre = new Map<string, PortraitFilm[]>();
  for (const f of withPublic) {
    const g = firstGenre(f.genre);
    if (g) byGenre.set(g, [...(byGenre.get(g) ?? []), f]);
  }
  const genreGaps = [...byGenre.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([genre, list]) => ({ genre, list, gap: mean(list.map((f) => f.score - f.publicScore!)) }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const overallPublic = withPublic.length >= 5 ? mean(withPublic.map((f) => f.score - f.publicScore!)) : null;
  const g0 = genreGaps[0];
  if (g0 && Math.abs(g0.gap) >= 0.7 && (overallPublic == null || Math.abs(g0.gap - overallPublic) >= 0.5)) {
    const ex = [...g0.list].sort((a, b) => (b.score - b.publicScore!) * Math.sign(g0.gap) - (a.score - a.publicScore!) * Math.sign(g0.gap));
    facts.push({
      kind: 'genrePublic',
      figure: signed(g0.gap),
      tone: 'blue',
      claim: `Sur le genre ${g0.genre.toLowerCase()}, tes notes sont ${f1(Math.abs(g0.gap))} point ${g0.gap > 0 ? 'au-dessus' : 'en dessous'} de celles du public (${g0.list.length} films).`,
      fallback: g0.gap > 0 ? `Sur le ${g0.genre.toLowerCase()}, tu vois plus haut que le public.` : `Sur le ${g0.genre.toLowerCase()}, tu es plus dur·e que le public.`,
      evidence: ex.slice(0, 2).map((f) => ev(f, `toi ${f1(f.score)} · public ${f1(f.publicScore!)}`)),
      strength: Math.abs(g0.gap) / 0.9,
    });
  }

  // 4. Plus dur ou plus généreux que le public, en général.
  if (overallPublic != null && Math.abs(overallPublic) >= 0.5) {
    const ex = [...withPublic].sort((a, b) => (a.score - a.publicScore!) * Math.sign(-overallPublic) - (b.score - b.publicScore!) * Math.sign(-overallPublic));
    facts.push({
      kind: 'public',
      figure: signed(overallPublic),
      tone: overallPublic < 0 ? 'orange' : 'lime',
      claim: `En moyenne, tes notes sont ${f1(Math.abs(overallPublic))} point ${overallPublic > 0 ? 'au-dessus' : 'en dessous'} de celles du public (${withPublic.length} films).`,
      fallback: overallPublic < 0 ? 'Tu notes plus dur que le public.' : 'Tu notes plus généreusement que le public.',
      evidence: ex.slice(0, 2).map((f) => ev(f, `toi ${f1(f.score)} · public ${f1(f.publicScore!)}`)),
      strength: Math.abs(overallPublic) / 0.9,
    });
  }

  // 5. Le critère sur lequel on est le plus sévère.
  if (detailed.length >= 6) {
    const means = CRITERIA.map((key) => ({ key, m: mean(detailed.map((f) => f.criteria![key])) }));
    const all = mean(means.map((x) => x.m));
    const low = [...means].sort((a, b) => a.m - b.m)[0];
    if (all - low.m >= 0.6) {
      const ex = [...detailed].sort((a, b) => (a.criteria![low.key] - a.score) - (b.criteria![low.key] - b.score));
      facts.push({
        kind: 'harshest',
        figure: signed(low.m - all),
        tone: 'orange',
        claim: `Ta note de ${LABEL[low.key]} est en moyenne ${f1(all - low.m)} point sous la moyenne de tes quatre critères.`,
        fallback: `${WITH_ARTICLE[low.key][0].toUpperCase()}${WITH_ARTICLE[low.key].slice(1)}, c'est là que tu ne pardonnes rien.`,
        evidence: ex.slice(0, 2).map((f) => ev(f, `${LABEL[low.key]} ${f1(f.criteria![low.key])} · note ${f1(f.score)}`)),
        strength: (all - low.m) / 0.8,
      });
    }
  }

  // 6. Ce qui a changé ces trois derniers mois.
  const cut = now - 90 * 864e5;
  const recent = rated.filter((f) => f.at >= cut);
  const before = rated.filter((f) => f.at > 0 && f.at < cut);
  if (recent.length >= 4 && before.length >= 4) {
    const gap = mean(recent.map((f) => f.score)) - mean(before.map((f) => f.score));
    if (Math.abs(gap) >= 0.6) {
      const ex = [...recent].sort((a, b) => (b.score - a.score) * Math.sign(gap));
      facts.push({
        kind: 'recent',
        figure: signed(gap),
        tone: gap < 0 ? 'orange' : 'lime',
        claim: `Depuis trois mois, tes notes sont ${f1(Math.abs(gap))} point ${gap > 0 ? 'plus hautes' : 'plus basses'} qu'avant (${recent.length} films récents).`,
        fallback: gap > 0 ? 'Ces derniers mois, tu notes plus haut.' : 'Ces derniers mois, tu deviens plus exigeant·e.',
        evidence: ex.slice(0, 2).map((f) => ev(f, f1(f.score))),
        strength: Math.abs(gap) / 0.9,
      });
    }
  }

  // 7. Un réalisateur fétiche.
  const byDirector = new Map<string, PortraitFilm[]>();
  for (const f of rated) if (f.director) byDirector.set(f.director, [...(byDirector.get(f.director) ?? []), f]);
  const fav = [...byDirector.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([name, list]) => ({ name, list, gap: mean(list.map((f) => f.score)) - avg }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (fav && fav.gap >= 0.8) {
    const ex = [...fav.list].sort((a, b) => b.score - a.score);
    facts.push({
      kind: 'director',
      figure: signed(fav.gap),
      tone: 'lime',
      claim: `Les films de ${fav.name} ont une note ${f1(fav.gap)} point au-dessus de ta moyenne (${fav.list.length} films).`,
      fallback: `${fav.name}, c'est presque toujours oui.`,
      evidence: ex.slice(0, 2).map((f) => ev(f, f1(f.score))),
      strength: fav.gap / 1,
    });
  }

  // 8. Le genre où l'on note le plus haut.
  const genreOwn = [...new Map(rated.map((f) => [firstGenre(f.genre), 0])).keys()]
    .filter(Boolean)
    .map((genre) => ({ genre, list: rated.filter((f) => firstGenre(f.genre) === genre) }))
    .filter((g) => g.list.length >= 3)
    .map((g) => ({ ...g, gap: mean(g.list.map((f) => f.score)) - avg }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (genreOwn && genreOwn.gap >= 0.7) {
    const ex = [...genreOwn.list].sort((a, b) => b.score - a.score);
    facts.push({
      kind: 'genre',
      figure: signed(genreOwn.gap),
      tone: 'blue',
      claim: `Tes films du genre ${genreOwn.genre.toLowerCase()} ont une note ${f1(genreOwn.gap)} point au-dessus de ta moyenne (${genreOwn.list.length} films).`,
      fallback: `Le ${genreOwn.genre.toLowerCase()}, c'est ton terrain.`,
      evidence: ex.slice(0, 2).map((f) => ev(f, f1(f.score))),
      strength: genreOwn.gap / 1,
    });
  }

  // Les trois plus nets, sans deux constats qui disent la même chose.
  const picked: PortraitFact[] = [];
  for (const fact of facts.filter((f) => f.evidence.length === 2).sort((a, b) => b.strength - a.strength)) {
    if (fact.kind === 'public' && picked.some((p) => p.kind === 'genrePublic')) continue;
    if (fact.kind === 'genrePublic' && picked.some((p) => p.kind === 'public')) continue;
    if (fact.kind === 'genre' && picked.some((p) => p.kind === 'genrePublic')) continue;
    picked.push(fact);
    if (picked.length === 3) break;
  }
  return picked;
}

/** Ce que reçoit le modèle : les constats dans l'ordre, à reformuler un par un. */
export function describeFacts(facts: PortraitFact[]): string {
  return [
    `Voici ${facts.length} constats déjà vérifiés, dans cet ordre. Pour chacun, écris UNE phrase courte (12 mots au plus), en tutoyant, qui dit la même chose sans rien ajouter. Le chiffre est affiché à côté : tu peux le reprendre dans le champ figure.`,
    ...facts.map((f, i) => `${i + 1}. ${f.claim} (chiffre affiché : ${f.figure})`),
  ].join('\n');
}
