import regMARaw from '../../docs/regMA?raw';

export const DEFAULT_REGULATION_SET = '';
export const REGULATION_SET_OPTIONS = [
  { value: DEFAULT_REGULATION_SET, label: 'No Regulation' },
  { value: 'M-A', label: 'M-A' },
];

const REGULATION_SET_FILES = {
  'M-A': regMARaw,
};

const TOKEN_ALIASES = new Map([
  ['alolan', 'alola'],
  ['galarian', 'galar'],
  ['hisuian', 'hisui'],
  ['paldean', 'paldea'],
  ['breed', ''],
  ['form', ''],
  ['variety', ''],
  ['most', ''],
  ['likely', ''],
  ['m', 'male'],
  ['f', 'female'],
  ['jumbo', 'super'],
  ['medium', 'average'],
]);

const NAME_ALIASES = new Map([
  ['eternal floette flower', 'eternal floette'],
  ['hisui stunfisk', 'galar stunfisk'],
]);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2640/g, ' female ')
    .replace(/\u2642/g, ' male ')
    .replace(/['.:()\-/]/g, ' ')
    .toLowerCase();
}

function canonicalizeName(value = '') {
  const tokens = normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      const normalized = token.replace(/[^a-z0-9]+/g, '');
      const alias = TOKEN_ALIASES.has(normalized) ? TOKEN_ALIASES.get(normalized) : normalized;
      return alias ? [alias] : [];
    });

  const key = [...new Set(tokens)].sort().join(' ');
  return NAME_ALIASES.get(key) || key;
}

function parseRegulationEntries(sourceText = '') {
  return String(sourceText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('-'));
}

function buildPokemonNameCandidates(pokemon) {
  const familyName = pokemon.baseSpecies || pokemon.name || pokemon.id;
  const formName = pokemon.forme || pokemon.baseForme || '';
  const candidates = [
    pokemon.name,
    pokemon.id,
    `${familyName} ${formName}`,
    `${formName} ${familyName}`,
  ];

  if (!formName) {
    candidates.push(familyName);
  }

  return [...new Set(candidates.map((value) => canonicalizeName(value)).filter(Boolean))];
}

export function applyRegulationSets(pokemonList = []) {
  const pokemonIdsByCandidate = new Map();

  pokemonList.forEach((pokemon) => {
    buildPokemonNameCandidates(pokemon).forEach((candidate) => {
      if (!pokemonIdsByCandidate.has(candidate)) {
        pokemonIdsByCandidate.set(candidate, new Set());
      }

      pokemonIdsByCandidate.get(candidate).add(pokemon.id);
    });
  });

  const regulationsByPokemonId = new Map();

  Object.entries(REGULATION_SET_FILES).forEach(([regulationSet, sourceText]) => {
    parseRegulationEntries(sourceText).forEach((entryName) => {
      const candidate = canonicalizeName(entryName);
      const matchedIds = pokemonIdsByCandidate.get(candidate);
      if (!matchedIds?.size) return;

      matchedIds.forEach((pokemonId) => {
        if (!regulationsByPokemonId.has(pokemonId)) {
          regulationsByPokemonId.set(pokemonId, new Set());
        }

        regulationsByPokemonId.get(pokemonId).add(regulationSet);
      });
    });
  });

  return pokemonList.map((pokemon) => ({
    ...pokemon,
    regulations: [...(regulationsByPokemonId.get(pokemon.id) || [])].sort((left, right) => left.localeCompare(right)),
  }));
}

export function filterPokemonFormsByRegulation(pokemon, regulationSet = DEFAULT_REGULATION_SET) {
  const forms = Array.isArray(pokemon?.forms) && pokemon.forms.length ? pokemon.forms : pokemon ? [pokemon] : [];

  if (!regulationSet) {
    return forms;
  }

  return forms.filter((form) => Array.isArray(form.regulations) && form.regulations.includes(regulationSet));
}
