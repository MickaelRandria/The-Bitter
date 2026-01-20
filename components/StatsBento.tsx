import React, { useMemo } from 'react';
import { Movie } from '../types';
import { ArrowUpRight } from 'lucide-react';

interface StatsBentoProps {
  movies: Movie[];
}

const StatsBento: React.FC<StatsBentoProps> = ({ movies }) => {
  const stats = useMemo(() => {
    const count = movies.length;
    if (count === 0) return { count: 0, avg: 0 };
    const totalScore = movies.reduce((acc, m) => {
      return acc + (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
    }, 0);
    return { count, avg: (totalScore / count).toFixed(1) };
  }, [movies]);

  return (
    <div className="mb-8 mt-4">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-primary tracking-tight leading-[1.1] mb-6">
        Elevate Your <br />
        <span className="text-secondary">Cinema Experience</span>
      </h1>

      <div className="flex items-center gap-4">
        {/* Metric 1 */}
        <div className="bg-surface px-6 py-4 rounded-2xl flex flex-col items-start">
          <span className="text-3xl font-bold text-primary">{stats.count}</span>
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Watched</span>
        </div>

        {/* Metric 2 */}
        <div className="bg-primary px-6 py-4 rounded-2xl flex flex-col items-start text-white relative overflow-hidden">
          <span className="text-3xl font-bold relative z-10">{stats.avg}</span>
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider relative z-10">Avg Score</span>
          <div className="absolute -right-2 -top-2 text-white/10">
            <ArrowUpRight size={48} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsBento;