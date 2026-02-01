
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

const StoryTemplate: React.FC<StoryTemplateProps> = ({ movie }) => {
  // Calculs
  const avgScore = (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
  const isDistracted = (movie.smartphoneFactor || 0) > 50;

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return "--";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m.toString().padStart(2, '0')}min`;
  };

  const getRatingColor = (val: number) => {
    if (val >= 8) return '#a3e635';
    if (val >= 5) return '#facc15';
    return '#ef4444';
  };

  // Styles de base
  const styles: { [key: string]: React.CSSProperties } = {
    root: {
      width: '1080px',
      height: '1920px',
      backgroundColor: '#F5F2ED',
      padding: '180px 50px 240px 50px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#1a1a1a',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '40px',
    },
    badge: {
      backgroundColor: '#a3e635',
      borderRadius: '999px',
      padding: '12px 28px',
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.2em',
    },
    year: {
      color: '#737373',
      fontSize: '13px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    posterCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: '2.8rem',
      height: '920px',
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
    noPoster: {
      width: '100%',
      height: '100%',
      backgroundColor: '#E8E5E0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#737373',
      fontSize: '24px',
      fontWeight: 700,
      textTransform: 'uppercase',
    },
    posterOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '60px 40px',
      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    title: {
      color: '#FFFFFF',
      fontSize: '52px',
      fontWeight: 900,
      lineHeight: 1.05,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    director: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: '16px',
      fontWeight: 600,
      margin: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    bentoRow: {
      flex: 1,
      display: 'flex',
      gap: '24px',
    },
    leftCol: {
      width: '420px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    rightCol: {
      flex: 1,
    },
    smallCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: '1.6rem',
      padding: '32px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    },
    verdictCard: {
      backgroundColor: isDistracted ? '#ef4444' : '#a3e635',
      borderRadius: '2.8rem',
      padding: '40px',
      height: '100%',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    },
    label: {
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: '#737373',
      marginBottom: '12px',
      display: 'block',
    },
    verdictLabel: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.25em',
      color: 'rgba(0,0,0,0.5)',
    },
    ratingRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '14px',
    },
    ratingLabel: {
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      color: '#737373',
      width: '70px',
    },
    ratingBarBg: {
      flex: 1,
      height: '6px',
      backgroundColor: '#F0EDE8',
      borderRadius: '999px',
      overflow: 'hidden',
    },
    ratingVal: {
      fontSize: '14px',
      fontWeight: 800,
      width: '25px',
      textAlign: 'right',
    },
    ghostScore: {
      position: 'absolute',
      top: '20px',
      right: '-30px',
      fontSize: '350px',
      fontWeight: 900,
      color: 'rgba(0,0,0,0.06)',
      pointerEvents: 'none',
      lineHeight: 1,
    }
  };

  return (
    <div style={styles.root}>
      {/* ROW 1: HEADER */}
      <div style={styles.header}>
        <div style={styles.badge}>The Bitter</div>
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
          <div style={styles.noPoster}>No Poster</div>
        )}
        <div style={styles.posterOverlay}>
          <h1 style={styles.title}>{movie.title}</h1>
          <p style={styles.director}>{movie.director}</p>
        </div>
      </div>

      {/* ROW 3: BENTO GRID */}
      <div style={styles.bentoRow}>
        {/* LEFT COLUMN */}
        <div style={styles.leftCol}>
          {/* Card A: Genre & Runtime */}
          <div style={{ ...styles.smallCard, flexDirection: 'row', padding: 0 }}>
            <div style={{ flex: 1, padding: '32px', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
              <span style={styles.label}>Genre</span>
              <span style={{ fontSize: '20px', fontWeight: 800, display: 'block' }}>{movie.genre}</span>
            </div>
            <div style={{ flex: 1, padding: '32px' }}>
              <span style={styles.label}>Durée</span>
              <span style={{ fontSize: '20px', fontWeight: 800, display: 'block' }}>{formatRuntime(movie.runtime)}</span>
            </div>
          </div>

          {/* Card B: Ratings */}
          <div style={styles.smallCard}>
            <span style={styles.label}>Détails Critiques</span>
            {[
              { label: 'Scénar', val: movie.ratings.story },
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
                    borderRadius: '999px'
                  }} />
                </div>
                <span style={styles.ratingVal}>{r.val}</span>
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
                  <span style={{ fontSize: '220px', fontWeight: 900, lineHeight: 0.9 }}>
                    {movie.smartphoneFactor}
                  </span>
                  <span style={{ fontSize: '110px', fontWeight: 900, opacity: 0.6 }}>%</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '220px', fontWeight: 900, lineHeight: 0.9 }}>
                    {Math.floor(avgScore)}
                  </span>
                  <span style={{ fontSize: '110px', fontWeight: 900, opacity: 0.4 }}>
                    .{Math.round((avgScore % 1) * 10)}
                  </span>
                </div>
              )}
              
              <span style={{ 
                fontSize: '24px', 
                fontWeight: 800, 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em',
                opacity: 0.4,
                display: 'block',
                marginTop: '10px'
              }}>
                {isDistracted ? '/ 100 FACTOR' : '/ 10 POINTS'}
              </span>
            </div>

            <div style={{ 
              backgroundColor: 'rgba(0,0,0,0.1)', 
              padding: '20px', 
              borderRadius: '1.2rem',
              position: 'relative',
              zIndex: 1
            }}>
              <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {isDistracted ? 'Lâchez ce téléphone.' : 'Analyse Certifiée'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryTemplate;
