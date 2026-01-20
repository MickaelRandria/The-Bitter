import { Movie, ThemeColor } from './types';

export const INITIAL_MOVIES: Movie[] = [
  {
    id: '1',
    title: 'Dune: Part Two',
    director: 'Denis Villeneuve',
    actors: 'Timothée Chalamet, Zendaya, Austin Butler',
    year: 2024,
    genre: 'Science-Fiction',
    ratings: { story: 9, visuals: 10, acting: 9, sound: 10 },
    review: "Un chef-d'œuvre visuel absolu.",
    dateAdded: Date.now() - 10000000,
    theme: 'orange',
    posterUrl: 'https://images.unsplash.com/photo-1541963463532-d68292c34b19?q=80&w=1000&auto=format&fit=crop',
    status: 'watched'
  },
  {
    id: '2',
    title: 'Past Lives',
    director: 'Celine Song',
    actors: 'Greta Lee, Teo Yoo',
    year: 2023,
    genre: 'Drame',
    ratings: { story: 10, visuals: 8, acting: 9, sound: 7 },
    review: "Incroyablement émouvant.",
    dateAdded: Date.now() - 5000000,
    theme: 'green',
    posterUrl: 'https://images.unsplash.com/photo-1493804714600-6edb1cd930f6?q=80&w=1000&auto=format&fit=crop',
    status: 'watched'
  },
  {
    id: '3',
    title: 'Winter Break',
    director: 'Alexander Payne',
    actors: 'Paul Giamatti, Dominic Sessa',
    year: 2023,
    genre: 'Comédie',
    ratings: { story: 8, visuals: 7, acting: 10, sound: 6 },
    review: "L'ambiance du cinéma classique.",
    dateAdded: Date.now(),
    theme: 'yellow',
    status: 'watched'
  },
  {
    id: '4',
    title: 'Oppenheimer',
    director: 'C. Nolan',
    actors: 'Cillian Murphy, Robert Downey Jr., Emily Blunt',
    year: 2023,
    genre: 'Biopic',
    ratings: { story: 9, visuals: 9, acting: 10, sound: 10 },
    review: "Une expérience intense.",
    dateAdded: Date.now() - 20000000,
    theme: 'black',
    posterUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e63?q=80&w=1000&auto=format&fit=crop',
    status: 'watched'
  }
];

export const GENRES = [
  'Action', 'Science-Fiction', 'Drame', 'Comédie', 'Thriller', 'Horreur', 'Romance', 'Documentaire', 'Biopic', 'Animation', 'Aventure'
];

export const THEME_COLORS: ThemeColor[] = ['orange', 'green', 'yellow', 'blue', 'purple', 'black'];