import React, { useEffect, useState } from 'react';
import { Share } from 'lucide-react';
import { haptics } from '../utils/haptics';

/**
 * Montre comment récupérer l'image d'une séance dans l'app UGC.
 *
 * Deux façons, et l'ordre est un choix : « Partager l'image » donne une image
 * qui porte toujours la date complète, là où l'écran de la séance n'écrit que
 * « Ce soir » le jour même. La capture d'écran reste montrée, c'est le réflexe.
 *
 * L'écran UGC n'est qu'évoqué (couleurs, disposition), sans logo ni marque.
 */
type Mode = 'share' | 'shot';
type Step = 'tab' | 'share' | 'save' | 'press' | 'thumb' | 'done';

const DEMO: Record<Mode, { steps: Step[]; hold: number[]; text: React.ReactNode[] }> = {
  share: {
    steps: ['tab', 'share', 'save', 'done'],
    hold: [1500, 1300, 1500, 2200],
    text: [
      <>Dans l’app UGC, onglet <b>Mes résas</b> : ouvre ta séance.</>,
      <>Touche le bouton <b>Partager</b>, à gauche de « Voir mon billet ».</>,
      <>Choisis <b>Enregistrer l’image</b>. Elle porte toujours la date complète.</>,
      <>C’est prêt : reviens ici et choisis l’image dans tes photos.</>,
    ],
  },
  shot: {
    steps: ['tab', 'press', 'thumb', 'done'],
    hold: [1500, 1300, 1500, 2200],
    text: [
      <>Dans l’app UGC, onglet <b>Mes résas</b> : ouvre ta séance.</>,
      <>Appuie en même temps sur le <b>bouton latéral</b> et le <b>volume haut</b>.</>,
      <>La capture part dans tes photos. Une capture par séance.</>,
      <>C’est prêt : reviens ici et choisis tes captures.</>,
    ],
  },
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TicketCaptureDemo: React.FC = () => {
  const [mode, setMode] = useState<Mode>('share');
  const [index, setIndex] = useState(0);
  const [tapKey, setTapKey] = useState(0);
  const demo = DEMO[mode];
  const step = demo.steps[index];

  useEffect(() => {
    setIndex(0);
  }, [mode]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % demo.steps.length), demo.hold[index]);
    // Le doigt se pose une fois arrivé, pas pendant son trajet.
    const tap = window.setTimeout(() => setTapKey((key) => key + 1), 650);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(tap);
    };
  }, [index, mode, demo]);

  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-stone-200 bg-gradient-to-b from-white to-stone-100 p-3.5 dark:border-white/10 dark:from-[#171717] dark:to-[#111]">
      <div role="tablist" aria-label="Façon d’obtenir l’image" className="flex rounded-2xl bg-stone-200/70 p-1 dark:bg-white/10">
        {(['share', 'shot'] as Mode[]).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => {
              haptics.soft();
              setMode(value);
            }}
            className={`flex-1 rounded-xl px-1 py-2 text-[11px] font-black leading-tight transition-colors ${
              mode === value ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            {value === 'share' ? 'Partager l’image' : 'Capture d’écran'}
            <span
              className={`mt-0.5 block text-[8.5px] font-black uppercase tracking-[0.12em] ${
                mode === value ? 'text-bitter-lime dark:text-forest' : 'text-forest dark:text-lime-300'
              }`}
            >
              {value === 'share' ? 'Recommandé' : 'Aussi possible'}
            </span>
          </button>
        ))}
      </div>

      <div className="tkd" data-step={step} aria-hidden="true">
        <div className="tkd-phone">
          <span className="tkd-bt tkd-vol" />
          <span className="tkd-bt tkd-vol2" />
          <span className="tkd-bt tkd-side" />
          <div className="tkd-screen">
            <span className="tkd-island" />
            <div className="tkd-content">
              <div className="tkd-when">
                <b>SAMEDI 17/10</b>
                <b>À 18:00</b>
                <span>Talence · en salle 2</span>
              </div>
              <span className="tkd-poster" />
              <div className="tkd-card">
                <div className="tkd-title">
                  HUNGER GAMES :<br />
                  L’EMBRASEMENT
                </div>
                <div className="tkd-pills">
                  <i>2H26</i>
                  <i>VOSTF</i>
                </div>
                <span className="tkd-share">
                  <Share size={10} strokeWidth={3} />
                </span>
                <span className="tkd-ticket">VOIR MON BILLET</span>
              </div>
              <div className="tkd-tabs">
                <span>
                  <i />
                  FILMS
                </span>
                <span>
                  <i />
                  CINÉMAS
                </span>
                <span className="tkd-search" />
                <span className="tkd-on">
                  <i />
                  MES RÉSAS
                </span>
                <span>
                  <i className="rounded-full" />
                  COMPTE
                </span>
              </div>
            </div>
            <div className="tkd-sheet">
              <div className="tkd-grab" />
              <div className="tkd-row">Copier</div>
              <div className="tkd-row tkd-hl">Enregistrer l’image</div>
              <div className="tkd-row">Ajouter aux favoris</div>
              <div className="tkd-row">Imprimer</div>
            </div>
            <span className="tkd-flash" />
            <div className="tkd-toast">
              <b>✓</b>
              {mode === 'share' ? 'Image enregistrée dans Photos' : 'Capture enregistrée dans Photos'}
            </div>
          </div>
        </div>
        {/* Deux animations identiques en alternance : changer de nom relance le
            « tap » sans recréer le doigt, qui garde donc son trajet animé. */}
        <span className={`tkd-finger ${tapKey % 2 ? 'tkd-tap-a' : 'tkd-tap-b'}`} />
      </div>

      <ol className="flex flex-col gap-1.5">
        {demo.text.map((text, position) => (
          <li
            key={position}
            className={`grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 rounded-xl px-2 py-1.5 text-[12.5px] leading-snug transition-all ${
              position === index || prefersReducedMotion()
                ? 'bg-white text-charcoal shadow-sm dark:bg-white/10 dark:text-white'
                : 'text-stone-400 dark:text-stone-500'
            }`}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${
                position === index ? 'bg-forest text-white' : 'bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-300'
              }`}
            >
              {position + 1}
            </span>
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default TicketCaptureDemo;
