import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../utils/haptics';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const handleToggle = () => {
    haptics.soft();
    toggleTheme();
  };

  return (
    <button
      onClick={handleToggle}
      className="w-10 h-10 rounded-2xl flex items-center justify-center 
                 bg-white dark:bg-[#1a1a1a] 
                 border border-sand dark:border-white/10 
                 shadow-sm dark:shadow-none
                 active:scale-90 transition-all group"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon size={18} className="text-charcoal group-hover:rotate-12 transition-transform" />
      ) : (
        <Sun size={18} className="text-white group-hover:rotate-45 transition-transform" />
      )}
    </button>
  );
};

export default ThemeToggle;
