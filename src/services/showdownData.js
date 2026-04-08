const SHOWDOWN_POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const SHOWDOWN_ABILITIES_URL = 'https://play.pokemonshowdown.com/data/abilities.js';
const SHOWDOWN_ITEMS_URL = 'https://play.pokemonshowdown.com/data/items.js';
const SHOWDOWN_TYPECHART_URL = 'https://play.pokemonshowdown.com/data/typechart.js';
const SHOWDOWN_ITEM_SPRITE_SHEET_URL = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png?v1';
const CACHE_KEY = 'pokechamp:showdown:v6';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const EXCLUDED_POKEMON_NONSTANDARD = new Set(['cap', 'custom', 'glitch', 'pokestar']);
const EXCLUDED_ITEM_NONSTANDARD = new Set(['custom', 'glitch']);

export const DEFAULT_TEAM = Array.from({ length: 6 }, () => ({
  pokemonId: '',
  nature: 'Serious',
}));

function isValidCache(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.pokemon) || !Array.isArray(data.items)) return false;

  return data.items.every((item) => typeof item?.spritenum === 'number');
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw?.data || !raw?.timestamp) return null;
    if (Date.now() - raw.timestamp > CACHE_TTL_MS) return null;
    if (!isValidCache(raw.data)) return null;
    return raw.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
  } catch {}
}

function toId(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function formatTypeName(typeId = '') {
  const value = String(typeId || '').trim().toLowerCase();
  if (!value) return '';
  return value[0].toUpperCase() + value.slice(1);
}

function guessGen(num) {
  if (num >= 906) return 9;
  if (num >= 810) return 8;
  if (num >= 722) return 7;
  if (num >= 650) return 6;
  if (num >= 494) return 5;
  if (num >= 387) return 4;
  if (num >= 252) return 3;
  if (num >= 152) return 2;
  return 1;
}

function parseExportedModule(sourceText, exportName) {
  const exportsObject = {};
  const reader = new Function('exports', `${sourceText}; return exports.${exportName};`);
  return reader(exportsObject);
}

function includePokemon(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (Number(entry.num) <= 0) return false;

  const nonstandard = String(entry.isNonstandard || '').toLowerCase();
  if (EXCLUDED_POKEMON_NONSTANDARD.has(nonstandard)) return false;

  return (Number(entry.gen) || guessGen(Number(entry.num))) <= 9;
}

function includeItem(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!entry.name) return false;
  if (Number(entry.num) <= 0) return false;

  const nonstandard = String(entry.isNonstandard || '').toLowerCase();
  if (EXCLUDED_ITEM_NONSTANDARD.has(nonstandard)) return false;

  return (Number(entry.gen) || 9) <= 9;
}

function normalizeAbilities(rawAbilities = {}, abilityMap) {
  return Object.entries(rawAbilities)
    .map(([slot, name]) => {
      if (!name) return null;
      const ability = abilityMap.get(toId(name));
      return {
        slot:
          {
            '0': 'Primary',
            '1': 'Secondary',
            H: 'Hidden',
            S: 'Special',
          }[slot] || slot,
        name,
        description: ability?.shortDesc || ability?.desc || '',
      };
    })
    .filter(Boolean);
}

function normalizePokemon(id, entry, abilityMap) {
  const gen = Number(entry.gen) || guessGen(Number(entry.num));
  const baseStats = {
    hp: Number(entry.baseStats?.hp) || 0,
    atk: Number(entry.baseStats?.atk) || 0,
    def: Number(entry.baseStats?.def) || 0,
    spa: Number(entry.baseStats?.spa) || 0,
    spd: Number(entry.baseStats?.spd) || 0,
    spe: Number(entry.baseStats?.spe) || 0,
  };

  const pokemon = {
    id,
    familyId: toId(entry.baseSpecies || entry.name || id),
    dexNumber: Number(entry.num),
    name: entry.name || id,
    baseSpecies: entry.baseSpecies || entry.name || id,
    forme: entry.forme || '',
    baseForme: entry.baseForme || '',
    gen,
    tier: entry.tier || entry.doublesTier || '',
    types: Array.isArray(entry.types) ? entry.types : [],
    abilities: normalizeAbilities(entry.abilities, abilityMap),
    baseStats,
    bst: Object.values(baseStats).reduce((sum, value) => sum + value, 0),
    eggGroups: Array.isArray(entry.eggGroups) ? entry.eggGroups : [],
    heightm: entry.heightm ?? null,
    weightkg: entry.weightkg ?? null,
    color: entry.color || '',
    requiredItem: entry.requiredItem || '',
    isBattleOnly: Boolean(entry.battleOnly),
    evoIds: Array.isArray(entry.evos) ? entry.evos.map((value) => toId(value)).filter(Boolean) : [],
  };

  pokemon.searchText = [pokemon.name, pokemon.baseSpecies, pokemon.forme, pokemon.baseForme, ...pokemon.types].join(' ').toLowerCase();
  return pokemon;
}

function sortPokemon(a, b) {
  if (a.dexNumber !== b.dexNumber) return a.dexNumber - b.dexNumber;
  return a.name.localeCompare(b.name);
}

function normalizeItem(id, entry) {
  return {
    id,
    itemNumber: Number(entry.num) || 0,
    name: entry.name || id,
    gen: Number(entry.gen) || null,
    spritenum: Number(entry.spritenum) || 0,
    description: entry.shortDesc || entry.desc || 'No description available from the source.',
    searchText: [entry.name, entry.shortDesc, entry.desc].filter(Boolean).join(' ').toLowerCase(),
  };
}

function sortItems(a, b) {
  return a.name.localeCompare(b.name) || a.itemNumber - b.itemNumber;
}

function selectDefaultPokemonForm(forms) {
  if (!forms.length) return null;

  return (
    forms.find((pokemon) => pokemon.id === pokemon.familyId) ||
    forms.find((pokemon) => pokemon.name === pokemon.baseSpecies) ||
    forms.find((pokemon) => !pokemon.forme && !pokemon.isBattleOnly) ||
    forms.find((pokemon) => !pokemon.isBattleOnly) ||
    forms[0]
  );
}

function isFinalEvolutionFamily(forms) {
  return !forms.some((pokemon) => pokemon.evoIds.length > 0);
}

function buildPokemonSearchIndex(pokemon) {
  const grouped = new Map();

  pokemon.forEach((entry) => {
    if (!grouped.has(entry.familyId)) {
      grouped.set(entry.familyId, []);
    }
    grouped.get(entry.familyId).push(entry);
  });

  const searchIndex = Array.from(grouped.entries())
    .filter(([, forms]) => isFinalEvolutionFamily(forms))
    .map(([familyId, forms]) => {
      const defaultForm = selectDefaultPokemonForm(forms);
      const orderedForms = [defaultForm, ...forms.filter((entry) => entry.id !== defaultForm.id).sort(sortPokemon)];
      const searchTypes = unique(orderedForms.flatMap((entry) => entry.types)).sort((left, right) => left.localeCompare(right));
      const searchGenerations = unique(orderedForms.map((entry) => entry.gen)).sort((left, right) => left - right);

      return {
        ...defaultForm,
        familyId,
        defaultFormId: defaultForm.id,
        forms: orderedForms,
        searchNames: unique(orderedForms.flatMap((entry) => [entry.name, entry.baseSpecies])),
        searchFormes: unique(orderedForms.flatMap((entry) => [entry.forme, entry.baseForme])),
        searchTypes,
        searchGenerations,
        searchText: unique(orderedForms.flatMap((entry) => [entry.name, entry.baseSpecies, entry.forme, entry.baseForme, ...entry.types]))
          .join(' ')
          .toLowerCase(),
        hasAlternateForms: orderedForms.length > 1,
        alternateFormCount: Math.max(0, orderedForms.length - 1),
      };
    })
    .sort(sortPokemon);

  return {
    searchIndex,
    familiesById: Object.fromEntries(searchIndex.map((entry) => [entry.familyId, entry])),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
}

export async function loadBattleDex() {
  const cached = readCache();
  if (cached) return cached;

  const [pokedex, abilitySource, itemSource, typeSource] = await Promise.all([
    fetchJson(SHOWDOWN_POKEDEX_URL),
    fetchText(SHOWDOWN_ABILITIES_URL),
    fetchText(SHOWDOWN_ITEMS_URL),
    fetchText(SHOWDOWN_TYPECHART_URL),
  ]);

  const abilityModule = parseExportedModule(abilitySource, 'BattleAbilities') || {};
  const abilityMap = new Map(
    Object.values(abilityModule)
      .filter((value) => value?.name)
      .map((value) => [toId(value.name), value]),
  );
  const itemModule = parseExportedModule(itemSource, 'BattleItems') || {};
  const typeChart = parseExportedModule(typeSource, 'BattleTypeChart') || {};

  const pokemon = Object.entries(pokedex)
    .filter(([, value]) => includePokemon(value))
    .map(([id, value]) => normalizePokemon(id, value, abilityMap))
    .sort(sortPokemon);
  const items = Object.entries(itemModule)
    .filter(([, value]) => includeItem(value))
    .map(([id, value]) => normalizeItem(id, value))
    .sort(sortItems);

  const byId = Object.fromEntries(pokemon.map((entry) => [entry.id, entry]));
  const { searchIndex, familiesById } = buildPokemonSearchIndex(pokemon);
  const data = {
    fetchedAt: new Date().toISOString(),
    pokemon,
    byId,
    searchIndex,
    familiesById,
    items,
    generations: unique(searchIndex.flatMap((entry) => entry.searchGenerations)).sort((left, right) => left - right),
    types: unique(pokemon.flatMap((entry) => entry.types)).sort((left, right) => left.localeCompare(right)),
    typeChart,
  };

  writeCache(data);
  return data;
}

function scoreResult(pokemon, query) {
  if (!query) return 1000 - pokemon.dexNumber / 10000;

  const normalizedNames = unique((pokemon.searchNames || [pokemon.name, pokemon.baseSpecies]).map((value) => toId(value)));
  const normalizedFormes = unique((pokemon.searchFormes || [pokemon.forme, pokemon.baseForme]).map((value) => toId(value)));
  const searchableTypes = unique(pokemon.searchTypes || pokemon.types || []);
  const normalizedQuery = toId(query);
  let score = 0;

  if (normalizedNames.some((value) => value === normalizedQuery)) score += 1200;
  if (normalizedFormes.some((value) => value === normalizedQuery)) score += 1020;
  if (normalizedNames.some((value) => value.startsWith(normalizedQuery))) score += 900;
  if (normalizedFormes.some((value) => value.startsWith(normalizedQuery))) score += 780;
  if (pokemon.searchText.includes(query.toLowerCase())) score += 550;
  if (searchableTypes.some((type) => type.toLowerCase().includes(query.toLowerCase()))) score += 250;

  return score - pokemon.dexNumber / 10000;
}

function matchesFilters(pokemon, filters = {}) {
  const generation = Number(filters.generation) || null;
  const primaryType = formatTypeName(filters.primaryType || '');
  const secondaryType = formatTypeName(filters.secondaryType || '');

  if (!generation && !primaryType && !secondaryType) {
    return true;
  }

  const forms = Array.isArray(pokemon.forms) && pokemon.forms.length ? pokemon.forms : [pokemon];

  return forms.some((form) => {
    if (generation && form.gen !== generation) return false;
    if (primaryType && !form.types.includes(primaryType)) return false;
    if (secondaryType && !form.types.includes(secondaryType)) return false;
    return true;
  });
}

export function searchPokemon(list, query, filters = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return list
    .map((pokemon) => ({
      pokemon,
      score: scoreResult(pokemon, normalizedQuery),
    }))
    .filter((entry) => (entry.score > 0 || !normalizedQuery) && matchesFilters(entry.pokemon, filters))
    .sort((left, right) => right.score - left.score || sortPokemon(left.pokemon, right.pokemon))
    .slice(0, 60)
    .map((entry) => entry.pokemon);
}

function scoreItem(item, query) {
  if (!query) return 1;

  const normalizedQuery = toId(query);
  const normalizedName = toId(item.name);
  let score = 0;

  if (normalizedName === normalizedQuery) score += 1200;
  if (normalizedName.startsWith(normalizedQuery)) score += 900;
  if (item.searchText.includes(query)) score += 400;
  if (item.description.toLowerCase().includes(query)) score += 180;

  return score;
}

export function searchItems(list, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const results = list
    .map((item) => ({
      item,
      score: scoreItem(item, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0 || !normalizedQuery);

  if (!normalizedQuery) {
    return results.map((entry) => entry.item).sort(sortItems);
  }

  return results
    .sort((left, right) => right.score - left.score || sortItems(left.item, right.item))
    .map((entry) => entry.item);
}

export function getItemIconStyle(item) {
  const spritenum = Number(item?.spritenum) || 0;
  const top = Math.floor(spritenum / 16) * 24;
  const left = (spritenum % 16) * 24;

  return {
    background: `transparent url(${SHOWDOWN_ITEM_SPRITE_SHEET_URL}) no-repeat scroll -${left}px -${top}px`,
  };
}

function applyDamageCode(multiplier, code) {
  if (code === 1) return multiplier * 2;
  if (code === 2) return multiplier * 0.5;
  if (code === 3) return 0;
  return multiplier;
}

export function computeTypeMultiplier(attackType, defenseTypes = [], typeChart = {}) {
  const normalizedAttackType = formatTypeName(attackType);
  const defendingTypes = defenseTypes.map((type) => toId(type)).filter(Boolean);

  return defendingTypes.reduce((multiplier, defenseTypeId) => {
    const defense = typeChart[defenseTypeId];
    const code = defense?.damageTaken?.[normalizedAttackType];
    return applyDamageCode(multiplier, code);
  }, 1);
}

export function computeTypeBuckets(types = [], typeChart = {}) {
  const multipliers = {};

  Object.keys(typeChart).forEach((attackTypeId) => {
    const attackTypeName = formatTypeName(attackTypeId);
    multipliers[attackTypeName] = computeTypeMultiplier(attackTypeName, types, typeChart);
  });

  const buckets = {
    x4: [],
    x2: [],
    x1: [],
    x05: [],
    x025: [],
    x0: [],
  };

  Object.entries(multipliers)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .forEach(([type, multiplier]) => {
      if (multiplier === 4) buckets.x4.push(type);
      else if (multiplier === 2) buckets.x2.push(type);
      else if (multiplier === 1) buckets.x1.push(type);
      else if (multiplier === 0.5) buckets.x05.push(type);
      else if (multiplier === 0.25) buckets.x025.push(type);
      else if (multiplier === 0) buckets.x0.push(type);
    });

  return buckets;
}

export function computeTeamPressure(team, typeChart) {
  const counts = {};

  team.forEach((pokemon) => {
    if (!pokemon) return;
    const buckets = computeTypeBuckets(pokemon.types, typeChart);
    [...buckets.x4, ...buckets.x2].forEach((type) => {
      counts[type] = (counts[type] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([type, count]) => ({ type, count }));
}

export function statEntries(stats) {
  return [
    ['hp', Number(stats?.hp) || 0],
    ['atk', Number(stats?.atk) || 0],
    ['def', Number(stats?.def) || 0],
    ['spa', Number(stats?.spa) || 0],
    ['spd', Number(stats?.spd) || 0],
    ['spe', Number(stats?.spe) || 0],
  ];
}

export function getArtworkUrl(pokemon) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.dexNumber}.png`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getSpriteCandidateIds(pokemon) {
  return unique([pokemon?.id, toId(pokemon?.baseSpecies), String(Number(pokemon?.dexNumber) || '')]);
}

export function getBattleSpriteSources(pokemon, perspective = 'front') {
  if (!pokemon?.dexNumber) return [];

  const showdownFolder = perspective === 'back' ? 'gen5-back' : 'gen5';
  const pokeApiFolder = perspective === 'back' ? 'back/' : '';
  const showdownSources = getSpriteCandidateIds(pokemon).map(
    (candidateId) => `https://play.pokemonshowdown.com/sprites/${showdownFolder}/${candidateId}.png`,
  );

  return unique([
    ...showdownSources,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokeApiFolder}${pokemon.dexNumber}.png`,
    getArtworkUrl(pokemon),
  ]);
}
