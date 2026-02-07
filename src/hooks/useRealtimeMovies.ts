import { useState, useEffect } from 'react';
import { supabase, SharedMovie, getSpaceMovies } from '../services/supabase';

export function useRealtimeMovies(spaceId: string) {
  const [movies, setMovies] = useState<SharedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId || !supabase) return;

    let isMounted = true;

    // 1. Chargement initial
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const data = await getSpaceMovies(spaceId);
        if (isMounted) setMovies(data);
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();

    // 2. Abonnement Realtime
    const channel = supabase
      .channel(`realtime-movies-${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Écoute INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'shared_movies',
          filter: `space_id=eq.${spaceId}`,
        },
        async (payload) => {
          if (!isMounted) return;

          if (payload.eventType === 'INSERT') {
            // Pour un INSERT, on doit récupérer la relation added_by_profile
            // car le payload realtime ne contient que les données brutes de la table
            const { data: newMovie, error } = await supabase
              .from('shared_movies')
              .select(`
                *,
                added_by_profile:profiles!added_by(first_name, last_name)
              `)
              .eq('id', payload.new.id)
              .single();

            if (!error && newMovie) {
              setMovies((prev) => [newMovie as SharedMovie, ...prev]);
            }
          } 
          else if (payload.eventType === 'DELETE') {
            setMovies((prev) => prev.filter((movie) => movie.id !== payload.old.id));
          }
          // Note: UPDATE n'est pas géré ici car le statut est la seule chose qui change
          // et cela impacterait la liste complète. À ajouter si besoin.
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [spaceId]);

  return { movies, loading, error };
}