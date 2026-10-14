import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(path, deps={}) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(exports,name=>{if(!deps[name])throw Error(name);return deps[name]});return exports;
}
const work=load('../utils/workKey.ts');
const collection=load('../utils/collectionRules.ts',{'./workKey':work});
const archetypes=load('../utils/archetypes.ts');
const history=load('../utils/ratingHistory.ts');
const verdict=load('../utils/verdict.ts');
const portrait=load('../utils/cinemaPortrait.ts',{'./archetypes':archetypes,'./collectionRules':collection,'./ratingHistory':history,'./verdict':verdict});
const insights=load('../utils/insights.ts',{'./cinemaPortrait':portrait});
const now=Date.parse('2026-10-14T12:00:00Z');
const genres=['Drame','Comédie','Documentaire','Aventure','Thriller','Science-Fiction'];
const movie=(i,over={})=>({id:String(i),tmdbId:i+100,title:'Film '+i,status:'watched',mediaType:'movie',genre:genres[i%6],ratings:{story:8,visuals:8,acting:8,sound:8},dateAdded:now-(30-i)*86400000,dateWatched:now-(30-i)*86400000,...over});

test('les neuf portraits utilisent le calcul commun, avec leurs propres sensibilités',()=>{
  const vectors=[
    [1,.3,.2,.5,.6,.8,.4],[.4,1,.3,.6,.4,.3,.5],[.1,.4,1,.5,.6,.1,.9],
    [.6,.5,.2,1,.3,.7,.2],[.3,.2,.7,.4,1,.4,1],[.9,.2,.3,.6,.9,.7,.6],
    [.4,.9,.2,.9,.2,.5,.3],[.9,.9,.1,.4,.3,.6,.3],[.5,.5,.5,.5,.5,.5,.5],
  ];
  portrait.PORTRAIT_TYPES.forEach((type,index)=>{
    const [cerebral,emotion,fun,visual,tension,severity,rhythm]=vectors[index];
    const films=Array.from({length:12},(_,i)=>movie(i,{vibe:{story:cerebral*10,emotion:emotion*10,fun:fun*10,visual:visual*10,tension:tension*10},smartphoneFactor:rhythm*100}));
    const result=portrait.buildCinemaPortrait(films,{severityIndex:severity*10,patienceLevel:rhythm*10});
    assert.equal(result.archetype.type.id,type.id);assert.equal(result.archetype.confirmed,true);
    if(type.id!=='omnivore') assert.equal(result.evidence.length,3);
  });
});
test('les zéros déclarés et les ressentis à zéro ne deviennent pas cinq',()=>{
  const films=Array.from({length:10},(_,i)=>movie(i,{vibe:{story:0,emotion:0,fun:0,visual:0,tension:0}}));
  const result=portrait.cinemaArchetype(films,{severityIndex:0,patienceLevel:0});
  const expected=archetypes.getAdvancedArchetype({vibes:{cerebral:0,emotion:0,fun:0,visual:0,tension:0},quality:{scenario:5,acting:5,visual:5,sound:5},smartphone:0,distinctGenreCount:6,severityIndex:0,rhythmIndex:0});
  assert.equal(result.title,expected.title);assert.equal(result.observedCount,10);
  assert.deepEqual(portrait.buildCinemaPortrait(films).traits,[]);
});
test('des données manquantes donnent un portrait provisoire sans preuves inventées',()=>{
  const films=Array.from({length:12},(_,i)=>movie(i));
  const result=portrait.buildCinemaPortrait(films,{severityIndex:8,patienceLevel:2});
  assert.equal(result.archetype.observedCount,0);assert.equal(result.archetype.confirmed,false);assert.deepEqual(result.traits,[]);
});
test('les variantes de genres sont normalisées, les séries, envies et copies sont écartées',()=>{
  assert.deepEqual(portrait.portraitGenres('Science-Fiction, science fiction; Sci-fi / Drame, Drama'),['Science-fiction','Drame']);
  const film=movie(0);
  const rows=[film,{...film,id:'copy'},movie(1,{status:'watchlist'}),movie(2,{mediaType:'tv'}),movie(3,{seasonNumber:1}),movie(4,{ratings:{story:0,visuals:0,acting:0,sound:0}})];
  assert.equal(portrait.portraitFilms(rows).length,1);
  assert.equal(portrait.portraitFilms([movie(5,{adaptiveRating:{weightedRating:0}})]).length,1);
});
test('un rewatch ne compte pas comme un autre film pour confirmer le portrait',()=>{
  const film=movie(0,{watches:Array.from({length:20},(_,i)=>({id:String(i),watched_at:new Date(now-i*86400000).toISOString()}))});
  assert.equal(portrait.cinemaArchetype([film]).confirmed,false);
  assert.equal(portrait.cinemaArchetype([film]).films.length,1);
});
test('l’évolution compare deux groupes datés distincts et exige un changement net',()=>{
  const films=Array.from({length:20},(_,i)=>movie(i,{genre:i>=10?'Documentaire':'Drame'}));
  const result=portrait.buildCinemaPortrait(films);
  assert.equal(result.evolution.kind,'genre');assert.equal(result.evolution.genre,'Documentaire');
  assert.equal(result.evolution.current,10);assert.equal(result.evolution.previous,0);
  assert.equal(portrait.buildCinemaPortrait(films.slice(0,19)).evolution,null);
  assert.equal(portrait.buildCinemaPortrait(films.map(m=>({...m,dateWatched:undefined}))).evolution,null);
  const stable=portrait.buildCinemaPortrait(films.map(m=>({...m,genre:'Drame'})));
  assert.equal(stable.evolution.kind,'stable');
});
test('la relecture du parcours utilise le même calcul que le portrait actuel',()=>{
  const films=Array.from({length:12},(_,i)=>movie(i,{vibe:{story:8,emotion:2,fun:2,visual:4,tension:9}}));
  const profile={severityIndex:7,patienceLevel:6};
  const result=insights.computeArchetypeEvolution(films,profile);
  assert.equal(result.snapshots.at(-1).title,portrait.cinemaArchetype(films,profile).title);
  assert.equal(result.snapshots.at(-1).isCurrent,true);
});
