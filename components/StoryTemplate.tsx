
import React from 'react';

interface StoryTemplateProps {
  movie: {
    title: string;
    director: string;
    year: number;
    genre: string;
    runtime?: number;
    posterUrl?: string;
    ratings: {
      story: number;
      visuals: number;
      acting: number;
      sound: number;
    };
    smartphoneFactor?: number;
  };
}

// Simple SVG Icons definitions to ensure perfect rendering with html2canvas
const Icons = {
  Film: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px' }}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 7h4"/><path d="M3 12h4"/><path d="M3 17h4"/><path d="M17 7h4"/><path d="M17 12h4"/><path d="M17 17h4"/>
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px' }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
};

const StoryTemplate: React.FC<StoryTemplateProps> = ({ movie }) => {
  // Logic (Untouched as requested)
  const avgScore = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const isDistracted = (movie.smartphoneFactor || 0) > 50;

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return "--";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  const getRatingColor = (val: number) => {
    if (val >= 8) return '#a3e635';
    if (val >= 5) return '#facc15';
    return '#ef4444';
  };

  // Swiss Modern Bento Light Styles
  const styles: { [key: string]: React.CSSProperties } = {
    root: {
      width: '1080px',
      height: '1920px',
      backgroundColor: '#F5F2ED',
      padding: '180px 50px 240px 50px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      color: '#1a1a1a',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '42px',
    },
    badge: {
      backgroundColor: '#a3e635',
      borderRadius: '999px',
      padding: '14px 32px',
      fontSize: '14px',
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.2em',
      display: 'flex',
      alignItems: 'center',
      boxShadow: '0 4px 16px rgba(163, 230, 53, 0.3)',
    },
    year: {
      color: '#1a1a1a',
      fontSize: '16px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    posterCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: '3rem',
      height: '780px',
      width: '100%',
      marginBottom: '32px',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
    },
    posterImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center top',
    },
    posterOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '80px 50px 50px 50px',
      background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minHeight: '280px',
      justifyContent: 'flex-end',
    },
    title: {
      color: '#FFFFFF',
      fontSize: '58px',
      fontWeight: 900,
      lineHeight: 1.1,
      margin: 0,
      letterSpacing: '-0.02em',
      textTransform: 'uppercase',
    },
    director: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: '18px',
      fontWeight: 700,
      margin: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
    },
    bentoRow: {
      flex: 1,
      display: 'flex',
      gap: '32px',
    },
    leftCol: {
      width: '440px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    rightCol: {
      flex: 1,
    },
    miniCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: '1.8rem',
      padding: '32px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      position: 'relative',
      overflow: 'hidden',
    },
    ratingsCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: '1.8rem',
      padding: '36px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      border: '2px solid #a3e635',
    },
    verdictCard: {
      backgroundColor: isDistracted ? '#ef4444' : '#a3e635',
      borderRadius: '3rem',
      padding: '48px',
      height: '100%',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    },
    label: {
      fontSize: '12px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: '#737373',
      marginBottom: '8px',
    },
    verdictLabel: {
      fontSize: '13px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.3em',
      color: 'rgba(0,0,0,0.6)',
    },
    ratingRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '16px',
    },
    ratingLabel: {
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      color: '#1a1a1a',
      width: '80px',
    },
    ratingBarBg: {
      flex: 1,
      height: '8px',
      backgroundColor: '#F0EDE8',
      borderRadius: '999px',
      overflow: 'hidden',
    },
    ratingVal: {
      fontSize: '16px',
      fontWeight: 800,
      width: '30px',
      textAlign: 'right',
    },
    ghostScore: {
      position: 'absolute',
      top: '-20px',
      right: '-50px',
      fontSize: '420px',
      fontWeight: 900,
      color: 'rgba(0,0,0,0.08)',
      pointerEvents: 'none',
      lineHeight: 1,
    },
    scoreMain: {
      fontSize: '260px', 
      fontWeight: 900, 
      lineHeight: 0.85,
      textShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
    scoreDecimal: {
      fontSize: '130px', 
      fontWeight: 900, 
      opacity: 0.45,
    },
    bottomBox: {
      backgroundColor: 'rgba(0,0,0,0.12)', 
      padding: '24px', 
      borderRadius: '1.4rem',
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      fontSize: '13px',
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    }
  };

  return (
    <div style={styles.root}>
      {/* ROW 1: HEADER & BRANDING */}
      <div style={styles.header}>
        <div style={styles.badge}>
          <Icons.Film />
          THE BITTER
        </div>
        <div style={styles.year}>{movie.year}</div>
      </div>

      {/* ROW 2: POSTER */}
      <div style={styles.posterCard}>
        {movie.posterUrl ? (
          <img 
            src={movie.posterUrl.replace('w780', 'original')} 
            alt={movie.title} 
            style={styles.posterImg}
            crossOrigin="anonymous"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#E8E5E0', color: '#737373', fontSize: '24px', fontWeight: 700 }}>
            No Poster
          </div>
        )}
        <div style={styles.posterOverlay}>
          <h1 style={styles.title}>{movie.title}</h1>
          <p style={styles.director}>{movie.director}</p>
        </div>
      </div>

      {/* ROW 3: BENTO GRID */}
      <div style={styles.bentoRow}>
        {/* LEFT COLUMN: DETAILS */}
        <div style={styles.leftCol}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* MINI CARD: GENRE */}
            <div style={{ ...styles.miniCard, background: 'linear-gradient(135deg, #FFFFFF 0%, #F9F9F9 100%)' }}>
              <span style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '18px' }}>🎬</span>
              <span style={styles.label}>Genre</span>
              <span style={{ fontSize: '22px', fontWeight: 900 }}>{movie.genre}</span>
            </div>
            {/* MINI CARD: DURATION */}
            <div style={{ ...styles.miniCard, background: 'linear-gradient(135deg, #F9F9F9 0%, #FFFFFF 100%)' }}>
              <span style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '18px' }}>⏱️</span>
              <span style={styles.label}>Durée</span>
              <span style={{ fontSize: '22px', fontWeight: 900 }}>{formatRuntime(movie.runtime)}</span>
            </div>
          </div>

          {/* CARD B: RATINGS */}
          <div style={styles.ratingsCard}>
            <span style={{ ...styles.label, color: '#a3e635', fontWeight: 800 }}>Détails Critiques</span>
            {[
              { label: 'Scénario', val: movie.ratings.story },
              { label: 'Visuel', val: movie.ratings.visuals },
              { label: 'Jeu', val: movie.ratings.acting },
              { label: 'Son', val: movie.ratings.sound },
            ].map((r, i) => (
              <div key={i} style={styles.ratingRow}>
                <span style={styles.ratingLabel}>{r.label}</span>
                <div style={styles.ratingBarBg}>
                  <div style={{
                    height: '100%',
                    width: `${r.val * 10}%`,
                    backgroundColor: getRatingColor(r.val),
                    borderRadius: '999px',
                    boxShadow: r.val >= 8 ? '0 2px 8px rgba(163, 230, 53, 0.4)' : 'none'
                  }} />
                </div>
                <span style={styles.ratingVal}>{r.val.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: VERDICT */}
        <div style={styles.rightCol}>
          <div style={styles.verdictCard}>
            <div style={styles.ghostScore}>
              {isDistracted ? movie.smartphoneFactor : Math.floor(avgScore)}
            </div>
            
            <span style={styles.verdictLabel}>
              {isDistracted ? 'Alerte Distraction' : 'Verdict Global'}
            </span>

            <div style={{ position: 'relative', zIndex: 1 }}>
              {isDistracted ? (
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={styles.scoreMain}>
                    {movie.smartphoneFactor}
                  </span>
                  <span style={{ ...styles.scoreDecimal, opacity: 0.6 }}>%</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={styles.scoreMain}>
                    {Math.floor(avgScore)}
                  </span>
                  <span style={styles.scoreDecimal}>
                    .{Math.round((avgScore % 1) * 10)}
                  </span>
                </div>
              )}
              
              <span style={{ 
                fontSize: '24px', 
                fontWeight: 900, 
                textTransform: 'uppercase', 
                letterSpacing: '0.2em',
                opacity: 0.4,
                display: 'block',
                marginTop: '10px'
              }}>
                {isDistracted ? 'Smartphone Factor' : 'Sur 10 points'}
              </span>
            </div>

            <div style={styles.bottomBox}>
              {!isDistracted && <Icons.Check />}
              {isDistracted ? 'Lâchez ce téléphone.' : 'Analyse Certifiée'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryTemplate;
