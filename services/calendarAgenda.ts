import { getSpacePlans } from './plans';
import { supabase } from './supabase';
import { listUpcomingScreenings } from './screenings';
import { AgendaEvent, calendarDay } from '../utils/calendarAgenda';

/** Les propositions seules ne portent ni le titre du film ni le nom de l'espace. */
export async function loadCalendarSessions(profileId: string) {
  const [screenings, plans] = await Promise.all([
    listUpcomingScreenings(profileId),
    getSpacePlans(),
  ]);
  if (!supabase || !plans.length) return { screenings, events: [] as AgendaEvent[] };
  const movieIds = [
    ...new Set(plans.map((plan) => plan.shared_movie_id).filter((id): id is string => !!id)),
  ];
  const spaceIds = [
    ...new Set(plans.map((plan) => plan.space_id).filter((id): id is string => !!id)),
  ];
  const [films, spaces] = await Promise.all([
    supabase.from('shared_movies').select('id, title, poster_url, tmdb_id').in('id', movieIds),
    supabase.from('shared_spaces').select('id, name').in('id', spaceIds),
  ]);
  if (films.error || spaces.error) throw new Error('calendar-sessions-unavailable');
  const byMovie = new Map((films.data ?? []).map((film) => [film.id, film]));
  const bySpace = new Map((spaces.data ?? []).map((space) => [space.id, space.name]));
  const events: AgendaEvent[] = [];
  for (const plan of plans) {
    const film = byMovie.get(plan.shared_movie_id ?? '');
    if (!film) continue;
    for (const slot of plan.slots) {
      const startsAt = Date.parse(slot.starts_at);
      if (
        !Number.isFinite(startsAt) ||
        startsAt <= Date.now() ||
        (plan.status === 'agreed' && slot.id !== plan.chosen_slot_id)
      )
        continue;
      events.push({
        id: `plan:${slot.id}`,
        day: calendarDay(startsAt),
        kind: 'plan',
        planId: plan.id,
        slotId: slot.id,
        startsAt,
        title: film.title,
        tmdbId: film.tmdb_id ?? undefined,
        posterUrl: film.poster_url ?? undefined,
        spaceName: bySpace.get(plan.space_id ?? ''),
        cinemaName: slot.cinema_name,
        participants: plan.participant_ids.length,
        ownPlan: plan.proposer_id === profileId,
        joined: plan.participant_ids.includes(profileId),
      });
    }
  }
  return { screenings, events };
}
