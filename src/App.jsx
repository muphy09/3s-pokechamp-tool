import React, { startTransition, useDeferredValue, useEffect, useId, useState } from 'react';
import logo from './assets/luxuryb.png';
import { NATURES, describeNature, getNature } from './data/natures.js';
import {
  computeTypeBuckets,
  computeTypeMultiplier,
  DEFAULT_REGULATION_SET,
  filterPokemonFormsByRegulation,
  getArtworkUrl,
  getBattleSpriteSources,
  getItemIconStyle,
  loadBattleDex,
  REGULATION_SET_OPTIONS,
  searchItems,
  searchPokemon,
  statEntries,
} from './services/showdownData.js';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.1';
const TAB_KEY = 'pokechamp:active-tab';
const BATTLE_MODE_KEY = 'pokechamp:battle-mode';
const PLAYER_TEAM_KEY = 'pokechamp:player-team';
const OPPONENT_TEAM_KEY = 'pokechamp:opponent-team';
const DEFAULT_NATURE = 'Serious';
const SINGLE_BATTLE_TEAM_SIZE = 3;
const MAX_TEAM_SIZE = 6;
const DRAG_MIME = 'application/x-pokechamp-team-slot';
const CONTEXT_MENU_WIDTH = 260;
const CONTEXT_MENU_HEIGHT = 320;
const TYPE_COLORS = {
  bug: '#A6B91A',
  dark: '#705746',
  dragon: '#6F35FC',
  electric: '#F7D02C',
  fairy: '#D685AD',
  fighting: '#C22E28',
  fire: '#EE8130',
  flying: '#A98FF3',
  ghost: '#735797',
  grass: '#7AC74C',
  ground: '#E2BF65',
  ice: '#96D9D6',
  normal: '#A8A77A',
  poison: '#A33EA1',
  psychic: '#F95587',
  rock: '#B6A136',
  steel: '#B7B7CE',
  stellar: '#4467D6',
  water: '#6390F0',
};

function withAlpha(hex, alpha) {
  return `${hex}${alpha}`;
}

function getTypeChipStyle(type, variant = 'default') {
  const color = TYPE_COLORS[String(type || '').toLowerCase()] || '#C89A35';

  if (variant === 'soft') {
    return {
      '--type-chip-bg': withAlpha(color, '20'),
      '--type-chip-border': withAlpha(color, '72'),
      '--type-chip-text': '#f7eedc',
    };
  }

  if (variant === 'accent') {
    return {
      '--type-chip-bg': withAlpha(color, '38'),
      '--type-chip-border': withAlpha(color, 'A8'),
      '--type-chip-text': '#fff8ee',
    };
  }

  return {
    '--type-chip-bg': color,
    '--type-chip-border': withAlpha(color, 'D8'),
    '--type-chip-text': '#fff8ee',
  };
}

function createEmptyRosterSlot() {
  return {
    pokemonId: '',
    nature: DEFAULT_NATURE,
    ability: '',
    fainted: false,
  };
}

function createDefaultTeamState() {
  return {
    roster: Array.from({ length: MAX_TEAM_SIZE }, () => createEmptyRosterSlot()),
    activeSlots: [null, null],
  };
}

function normalizeRoster(rawRoster) {
  return Array.from({ length: MAX_TEAM_SIZE }, (_, index) => {
    const slot = Array.isArray(rawRoster) ? rawRoster[index] : null;
    return {
      pokemonId: typeof slot?.pokemonId === 'string' ? slot.pokemonId : '',
      nature: typeof slot?.nature === 'string' ? slot.nature : DEFAULT_NATURE,
      ability: typeof slot?.ability === 'string' ? slot.ability : '',
      fainted: Boolean(slot?.fainted),
    };
  });
}

function normalizeActiveSlots(activeSlots, roster) {
  const next = [null, null];
  const used = new Set();
  const rawActiveSlots = Array.isArray(activeSlots) ? activeSlots : [];

  for (let position = 0; position < 2; position += 1) {
    const value = rawActiveSlots[position];
    const rosterIndex = Number.isInteger(value) ? value : null;
    const slot = rosterIndex != null ? roster[rosterIndex] : null;

    if (rosterIndex == null || rosterIndex < 0 || rosterIndex >= roster.length) continue;
    if (!slot?.pokemonId || slot.fainted || used.has(rosterIndex)) continue;

    next[position] = rosterIndex;
    used.add(rosterIndex);
  }

  if (next[0] == null && next[1] != null) {
    next[0] = next[1];
    next[1] = null;
  }

  return next;
}

function normalizeTeamState(rawValue) {
  const roster = normalizeRoster(rawValue?.roster);
  return {
    roster,
    activeSlots: normalizeActiveSlots(rawValue?.activeSlots, roster),
  };
}

function cloneTeamState(teamState) {
  return {
    roster: teamState.roster.map((slot) => ({ ...slot })),
    activeSlots: [...teamState.activeSlots],
  };
}

function readStoredMode() {
  try {
    const raw = localStorage.getItem(BATTLE_MODE_KEY);
    return raw === '2v2' ? '2v2' : '1v1';
  } catch {
    return '1v1';
  }
}

function clearStoredSessionState() {
  try {
    localStorage.removeItem(TAB_KEY);
    localStorage.removeItem(PLAYER_TEAM_KEY);
    localStorage.removeItem(OPPONENT_TEAM_KEY);
  } catch {}
}

function getActiveCount(battleMode) {
  return battleMode === '2v2' ? 2 : 1;
}

function getTeamSize(battleMode) {
  return battleMode === '1v1' ? SINGLE_BATTLE_TEAM_SIZE : MAX_TEAM_SIZE;
}

function getDefaultAbilityName(pokemon) {
  return pokemon?.abilities?.[0]?.name || '';
}

function getSelectedAbility(pokemon, abilityName) {
  if (!pokemon) return null;

  return pokemon.abilities.find((entry) => entry.name === abilityName) || pokemon.abilities[0] || null;
}

function buildTeamView(teamState, byId, typeChart, battleMode) {
  const normalized = normalizeTeamState(teamState);
  const visibleTeamSize = getTeamSize(battleMode);
  const visibleActiveSlots = normalized.activeSlots.slice(0, getActiveCount(battleMode));

  const rosterEntries = normalized.roster.map((slot, rosterIndex) => {
    const pokemon = slot.pokemonId ? byId[slot.pokemonId] || null : null;
    const activePosition = visibleActiveSlots.findIndex((value) => value === rosterIndex);
    const selectedAbility = getSelectedAbility(pokemon, slot.ability);

    return {
      rosterIndex,
      pokemon,
      nature: slot.nature || DEFAULT_NATURE,
      ability: selectedAbility?.name || slot.ability || '',
      selectedAbility,
      fainted: Boolean(slot.fainted),
      buckets: pokemon ? computeTypeBuckets(pokemon.types, typeChart) : null,
      isActive: activePosition !== -1,
      activePosition,
    };
  });

  const visibleRosterEntries = rosterEntries.slice(0, visibleTeamSize);

  const activeEntries = visibleActiveSlots.map((rosterIndex, activePosition) => {
    if (rosterIndex == null) {
      return {
        rosterIndex: null,
        pokemon: null,
        nature: DEFAULT_NATURE,
        ability: '',
        selectedAbility: null,
        fainted: false,
        buckets: null,
        isActive: false,
        activePosition,
      };
    }

    return {
      ...rosterEntries[rosterIndex],
      activePosition,
    };
  });

  return {
    rosterEntries: visibleRosterEntries,
    activeEntries,
    visibleActiveSlots,
    fullActiveSlots: normalized.activeSlots,
  };
}

function getReplacementCandidates(teamView) {
  return teamView.rosterEntries.filter((entry) => entry.pokemon && !entry.fainted && !entry.isActive);
}

function formatTypeName(type = '') {
  const value = String(type || '').trim().toLowerCase();
  if (!value) return '';
  return value[0].toUpperCase() + value.slice(1);
}

function computeAttackRecommendations(entries, typeChart) {
  const activeEntries = entries.filter((entry) => entry?.pokemon && !entry.fainted);

  if (!activeEntries.length) {
    return [];
  }

  return Object.keys(typeChart)
    .map((attackTypeId) => {
      const type = formatTypeName(attackTypeId);
      const details = activeEntries
        .map((entry) => ({
          name: entry.pokemon.name,
          multiplier: computeTypeMultiplier(type, entry.pokemon.types, typeChart),
        }))
        .filter((item) => item.multiplier > 1)
        .sort((left, right) => right.multiplier - left.multiplier || left.name.localeCompare(right.name));

      if (!details.length) return null;

      return {
        type,
        details,
        hitCount: details.length,
        strongestMultiplier: details[0]?.multiplier || 0,
        totalMultiplier: details.reduce((total, item) => total + item.multiplier, 0),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.hitCount - left.hitCount ||
        right.strongestMultiplier - left.strongestMultiplier ||
        right.totalMultiplier - left.totalMultiplier ||
        left.type.localeCompare(right.type),
    )
    .slice(0, 8);
}

function getSlotStatus(entry) {
  if (!entry?.pokemon) return 'Empty';
  if (entry.fainted) return 'Fainted';
  if (entry.isActive) return 'Active';
  return 'Party';
}

function sideLabel(side) {
  return side === 'player' ? 'Your Team' : 'Enemy Team';
}

function formatStatLabel(key) {
  return (
    {
      hp: 'HP',
      atk: 'Atk',
      def: 'Def',
      spa: 'SpA',
      spd: 'SpD',
      spe: 'Spe',
    }[key] || key.toUpperCase()
  );
}

function createSearchFilters() {
  return {
    generation: '',
    primaryType: '',
    secondaryType: '',
    ability: '',
  };
}

function getUpdateDownloadingDetail(version) {
  return version ? `Update ${version} is downloading.` : 'Update is downloading.';
}

function getUpdateDownloadedDetail(version) {
  return version ? `Update ${version} is ready to install.` : 'An update is ready to install.';
}

function resolveUpdateState(snapshot, fallbackVersion = APP_VERSION) {
  const currentVersion =
    typeof snapshot?.current === 'string' && snapshot.current ? snapshot.current : fallbackVersion;
  const nextVersion =
    typeof snapshot?.version === 'string' && snapshot.version ? snapshot.version : null;
  const detail =
    typeof snapshot?.message === 'string'
      ? snapshot.message
      : typeof snapshot?.detail === 'string'
        ? snapshot.detail
        : '';

  switch (snapshot?.status) {
    case 'checking':
      return { version: currentVersion, status: 'checking', detail: detail || 'Checking updates...' };
    case 'available':
    case 'downloading':
      return {
        version: currentVersion,
        status: 'downloading',
        detail: detail || getUpdateDownloadingDetail(nextVersion),
      };
    case 'downloaded':
      return {
        version: currentVersion,
        status: 'downloaded',
        detail: detail || getUpdateDownloadedDetail(nextVersion),
      };
    case 'current':
    case 'unsupported':
    case 'uptodate':
      return {
        version: currentVersion,
        status: 'current',
        detail: detail || 'You are on the latest release.',
      };
    case 'error':
      return {
        version: currentVersion,
        status: 'error',
        detail: detail || 'Update check failed.',
      };
    case 'idle':
    default:
      return {
        version: currentVersion,
        status: snapshot?.status || 'idle',
        detail,
      };
  }
}

function formatGenerationLabel(generations = []) {
  if (!generations.length) return 'Unknown Gen';
  if (generations.length === 1) return `Gen ${generations[0]}`;
  return `Gens ${generations.join(', ')}`;
}

function getFormLabel(pokemon, defaultFormId) {
  if (!pokemon) return 'Unknown form';
  if (pokemon.id === defaultFormId) {
    return pokemon.baseForme ? `${pokemon.baseForme} (Default)` : 'Original form';
  }
  if (pokemon.forme) return pokemon.forme;
  if (pokemon.baseForme) return pokemon.baseForme;
  return 'Alternate form';
}

function renderWeaknessChips(buckets, mode = 'weak') {
  if (!buckets) return [];
  if (mode === 'weak') {
    return [...buckets.x4.map((type) => ({ type, label: '4x' })), ...buckets.x2.map((type) => ({ type, label: '2x' }))];
  }
  return [...buckets.x05.map((type) => ({ type, label: '0.5x' })), ...buckets.x025.map((type) => ({ type, label: '0.25x' })), ...buckets.x0.map((type) => ({ type, label: '0x' }))];
}

function TypeChip({ type, accent = false, soft = false, stat = null }) {
  const variant = accent ? 'accent' : soft ? 'soft' : 'default';
  return (
    <span className={`type-chip${accent ? ' type-chip-accent' : ''}${soft ? ' type-chip-soft' : ''}`} style={getTypeChipStyle(type, variant)}>
      <span>{type}</span>
      {stat ? <strong>{stat}</strong> : null}
    </span>
  );
}

function StatMeter({ label, value }) {
  const width = `${Math.max(16, Math.min(100, Math.round((value / 255) * 100)))}%`;
  return (
    <div className="stat-meter">
      <span className="stat-label">{label}</span>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width }} />
      </div>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function SpriteImage({ sources, alt, className = '', fallbackClassName = 'artwork-fallback', fallbackLabel = '?' }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sourceKey = sources.join('|');
  const currentSource = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  if (!currentSource) {
    return <div className={`${fallbackClassName} ${className}`.trim()}>{fallbackLabel}</div>;
  }

  return (
    <img
      className={className}
      src={currentSource}
      alt={alt}
      loading="lazy"
      onError={() => {
        setSourceIndex((current) => current + 1);
      }}
    />
  );
}

function PokemonArtwork({ pokemon, className = '' }) {
  const initials = (pokemon?.name || '?')
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <SpriteImage
      sources={pokemon ? [getArtworkUrl(pokemon)] : []}
      alt={pokemon?.name || 'Pokemon'}
      className={className}
      fallbackLabel={initials || '?'}
    />
  );
}

function PokemonBattleSprite({ pokemon, perspective = 'front', className = '', compact = false }) {
  const initials = (pokemon?.name || '?')
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <SpriteImage
      sources={pokemon ? getBattleSpriteSources(pokemon, perspective) : []}
      alt={pokemon?.name || 'Pokemon'}
      className={className}
      fallbackClassName={`battle-sprite-fallback${compact ? ' battle-sprite-fallback-compact' : ''}`}
      fallbackLabel={initials || '?'}
    />
  );
}

function HoverCard({ hoverState }) {
  if (!hoverState?.pokemon) return null;

  const { pokemon, ability, selectedAbility, buckets, position } = hoverState;
  const weak = renderWeaknessChips(buckets, 'weak').slice(0, 6);
  const activeAbility = selectedAbility || getSelectedAbility(pokemon, ability);
  const abilityMeta = activeAbility?.description || (activeAbility?.slot ? `${activeAbility.slot} Ability` : 'No ability data available.');

  return (
    <div className="hover-card" style={{ left: position.x, top: position.y }}>
      <div className="hover-card-header">
        <PokemonArtwork pokemon={pokemon} className="hover-artwork" />
        <div>
          <h3>{pokemon.name}</h3>
          <div className="type-row">
            {pokemon.types.map((type) => (
              <TypeChip key={`${pokemon.id}-${type}`} type={type} soft />
            ))}
          </div>
        </div>
      </div>

      <div className="hover-grid">
        <div>
          <p className="hover-label">Base Stats</p>
          <div className="hover-stat-row">
            {statEntries(pokemon.baseStats).map(([key, value]) => (
              <span key={`${pokemon.id}-${key}`} className="hover-stat-pill">
                {formatStatLabel(key)} {value}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="hover-label">Weaknesses</p>
          <div className="type-row">
            {weak.length ? weak.map((entry) => <TypeChip key={`${pokemon.id}-${entry.type}-${entry.label}`} type={entry.type} accent stat={entry.label} />) : <span className="muted-copy">No direct weaknesses</span>}
          </div>
        </div>
      </div>

      <div className="hover-footer">
        <span className="nature-pill">{activeAbility?.name || 'No Ability'}</span>
        <span className="muted-copy">{abilityMeta}</span>
      </div>
    </div>
  );
}

function SearchFilters({
  generations,
  types,
  abilities,
  filters,
  onChange,
  compact = false,
  regulationSet = DEFAULT_REGULATION_SET,
  regulationSets = REGULATION_SET_OPTIONS,
  onRegulationChange,
}) {
  const abilityOptionsId = useId();

  return (
    <div className={`search-filter-row${compact ? ' search-filter-row-compact' : ''}`}>
      <label className="search-filter-field">
        <span className="fact-label">Regulation Set</span>
        <select
          className="search-input search-select"
          value={regulationSet}
          onChange={(event) => onRegulationChange?.(event.target.value)}
        >
          {regulationSets.map((option) => (
            <option key={option.value || 'none'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="search-filter-field">
        <span className="fact-label">Generation</span>
        <select
          className="search-input search-select"
          value={filters.generation}
          onChange={(event) => onChange((current) => ({ ...current, generation: event.target.value }))}
        >
          <option value="">All generations</option>
          {generations.map((generation) => (
            <option key={generation} value={generation}>
              Gen {generation}
            </option>
          ))}
        </select>
      </label>

      <label className="search-filter-field">
        <span className="fact-label">Type</span>
        <select
          className="search-input search-select"
          value={filters.primaryType}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              primaryType: event.target.value,
              secondaryType:
                event.target.value && current.secondaryType !== event.target.value ? current.secondaryType : '',
            }))
          }
        >
          <option value="">Any type</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      {filters.primaryType ? (
        <label className="search-filter-field">
          <span className="fact-label">2nd Type</span>
          <select
            className="search-input search-select"
            value={filters.secondaryType}
            onChange={(event) => onChange((current) => ({ ...current, secondaryType: event.target.value }))}
          >
            <option value="">Any second type</option>
            {types
              .filter((type) => type !== filters.primaryType)
              .map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <label className="search-filter-field">
        <span className="fact-label">Ability</span>
        <input
          className="search-input"
          type="search"
          list={abilityOptionsId}
          placeholder="Any ability"
          value={filters.ability}
          onChange={(event) => onChange((current) => ({ ...current, ability: event.target.value }))}
        />
        <datalist id={abilityOptionsId}>
          {abilities.map((ability) => (
            <option key={ability} value={ability} />
          ))}
        </datalist>
      </label>
    </div>
  );
}

function PokemonSearchResultCard({ pokemon, onSelect, compact = false }) {
  return (
    <button
      key={pokemon.familyId}
      type="button"
      className={`result-card${compact ? '' : ' catalog-card'}`}
      onClick={() => onSelect(pokemon)}
    >
      <PokemonArtwork pokemon={pokemon} className="result-artwork" />
      <div className="result-copy">
        <div className="result-headline">
          <strong>{pokemon.name}</strong>
          <span className="result-headline-meta">
            <span className="muted-copy">{formatGenerationLabel(pokemon.searchGenerations || [pokemon.gen])}</span>
            <span className="muted-copy">Dex #{pokemon.dexNumber}</span>
          </span>
        </div>
        <div className="type-row result-type-row">
          {pokemon.types.map((type) => (
            <TypeChip key={`${pokemon.familyId}-${type}`} type={type} soft />
          ))}
        </div>
      </div>
    </button>
  );
}

function SearchDrawer({
  dataState,
  onClose,
  onChoose,
  onClear,
  drawerState,
  regulationSet,
  onRegulationChange,
  selectedEntry,
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(createSearchFilters);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!drawerState.open) {
      setQuery('');
      setFilters(createSearchFilters());
    }
  }, [drawerState.open]);

  if (!drawerState.open) return null;

  const results = searchPokemon(dataState.data?.searchIndex || [], deferredQuery, { ...filters, regulationSet });
  const statusLabel = selectedEntry?.pokemon ? getSlotStatus(selectedEntry) : 'Empty';
  const generations = dataState.data?.generations || [];
  const regulationSets = dataState.data?.regulationSets || REGULATION_SET_OPTIONS;
  const types = dataState.data?.types || [];
  const abilities = dataState.data?.abilities || [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="search-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="search-drawer-header">
          <div>
            <p className="eyebrow">Pokemon Search</p>
            <h2>{sideLabel(drawerState.side)}</h2>
            <p className="muted-copy">
              Team Slot {drawerState.rosterIndex + 1} - {statusLabel}
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-toolbar">
          <input
            autoFocus
            className="search-input"
            type="search"
            placeholder="Search by Pokemon, form, or type"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="ghost-button" type="button" onClick={onClear} disabled={!selectedEntry?.pokemon}>
            Clear Slot
          </button>
        </div>

        <SearchFilters
          generations={generations}
          types={types}
          abilities={abilities}
          filters={filters}
          onChange={setFilters}
          compact
          regulationSet={regulationSet}
          regulationSets={regulationSets}
          onRegulationChange={onRegulationChange}
        />

        {dataState.status === 'loading' ? <div className="drawer-empty">Loading Pokemon data...</div> : null}
        {dataState.status === 'error' ? <div className="drawer-empty">{dataState.error}</div> : null}
        {dataState.status === 'ready' && results.length === 0 ? <div className="drawer-empty">No Pokemon matched that search.</div> : null}

        <div className="result-list">
          {results.map((pokemon) => (
            <PokemonSearchResultCard key={pokemon.familyId} pokemon={pokemon} onSelect={onChoose} compact />
          ))}
        </div>
      </aside>
    </div>
  );
}

function PokemonSearchTab({ dataState, onOpenProfile, regulationSet, onRegulationChange }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(createSearchFilters);
  const deferredQuery = useDeferredValue(query);
  const results = searchPokemon(dataState.data?.searchIndex || [], deferredQuery, { ...filters, regulationSet });
  const generations = dataState.data?.generations || [];
  const regulationSets = dataState.data?.regulationSets || REGULATION_SET_OPTIONS;
  const types = dataState.data?.types || [];
  const abilities = dataState.data?.abilities || [];

  return (
    <section className="catalog-panel">
      <div className="catalog-header">
        <h2>Pokemon Search</h2>
        <input
          className="search-input catalog-search"
          type="search"
          placeholder="Search by Pokemon, form, or type"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <SearchFilters
        generations={generations}
        types={types}
        abilities={abilities}
        filters={filters}
        onChange={setFilters}
        regulationSet={regulationSet}
        regulationSets={regulationSets}
        onRegulationChange={onRegulationChange}
      />

      {dataState.status === 'loading' ? <div className="drawer-empty">Loading Pokemon data...</div> : null}
      {dataState.status === 'error' ? <div className="drawer-empty">{dataState.error}</div> : null}
      {dataState.status === 'ready' && results.length === 0 ? <div className="drawer-empty">No Pokemon matched that search.</div> : null}

      <div className="catalog-grid">
        {results.map((pokemon) => (
          <PokemonSearchResultCard key={pokemon.familyId} pokemon={pokemon} onSelect={onOpenProfile} />
        ))}
      </div>
    </section>
  );
}

function ItemSearchResultCard({ item }) {
  return (
    <article className="item-card">
      <div className="item-card-header">
        <div className="item-card-title">
          <span className="item-card-icon" style={getItemIconStyle(item)} aria-hidden="true" />
          <strong>{item.name}</strong>
        </div>
        {item.gen ? <span className="muted-copy">Gen {item.gen}</span> : null}
      </div>
      <p className="item-card-description">{item.description}</p>
    </article>
  );
}

function ItemSearchTab({ dataState }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = searchItems(dataState.data?.items || [], deferredQuery);

  return (
    <section className="catalog-panel">
      <div className="catalog-header">
        <div>
          <h2>Items</h2>
          {dataState.status === 'ready' ? <p className="muted-copy">{results.length} item{results.length === 1 ? '' : 's'}</p> : null}
        </div>
        <input
          className="search-input catalog-search"
          type="search"
          placeholder="Search by item name or description"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {dataState.status === 'loading' ? <div className="drawer-empty">Loading item data...</div> : null}
      {dataState.status === 'error' ? <div className="drawer-empty">{dataState.error}</div> : null}
      {dataState.status === 'ready' && results.length === 0 ? <div className="drawer-empty">No items matched that search.</div> : null}

      <div className="catalog-grid catalog-grid-items">
        {results.map((item) => (
          <ItemSearchResultCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ProfileOverlay({ entry, mode = 'search', onClose, onNatureChange, onAbilityChange }) {
  if (!entry?.pokemon) return null;

  const { pokemon, nature, ability, selectedAbility, buckets, fainted, isActive } = entry;
  const weak = renderWeaknessChips(buckets, 'weak');
  const resist = renderWeaknessChips(buckets, 'resist');
  const natureInfo = describeNature(getNature(nature));
  const activeAbility = selectedAbility || getSelectedAbility(pokemon, ability);
  const activeAbilityMeta = activeAbility
    ? `${activeAbility.slot}${activeAbility.description ? ` - ${activeAbility.description}` : ''}`
    : 'No ability data available from the source.';
  const stateLabel = fainted ? 'Fainted' : isActive ? 'Active on the field' : 'On the bench';

  return (
    <div className="profile-backdrop" onClick={onClose}>
      <section className="profile-overlay" onClick={(event) => event.stopPropagation()}>
        <div className="profile-header">
          <div className="profile-title">
            <PokemonArtwork pokemon={pokemon} className="profile-artwork" />
            <div>
              <p className="eyebrow">Pokemon Details</p>
              <h2>{pokemon.name}</h2>
              <div className="type-row">
                {pokemon.types.map((type) => (
                  <TypeChip key={`${pokemon.id}-${type}`} type={type} />
                ))}
              </div>
              <p className="muted-copy">
                {stateLabel} - Gen {pokemon.gen} - Dex #{pokemon.dexNumber} - BST {pokemon.bst}
                {pokemon.tier ? ` - ${pokemon.tier}` : ''}
              </p>
            </div>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="profile-grid">
          <article className="profile-panel">
            <p className="eyebrow">Overview</p>
            <div className="profile-facts">
              <div>
                <span className="fact-label">{mode === 'battle' ? 'Ability' : 'Nature'}</span>
                {mode === 'battle' ? (
                  <>
                    <select
                      className="search-input search-select nature-select-wide"
                      value={activeAbility?.name || ''}
                      onChange={(event) => onAbilityChange?.(event.target.value)}
                    >
                      {pokemon.abilities.length ? (
                        pokemon.abilities.map((entryAbility) => (
                          <option key={`${pokemon.id}-${entryAbility.slot}-${entryAbility.name}`} value={entryAbility.name}>
                            {entryAbility.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No ability data</option>
                      )}
                    </select>
                    <p className="muted-copy">{activeAbilityMeta}</p>
                  </>
                ) : (
                  <>
                    <select className="search-input search-select nature-select-wide" value={nature} onChange={(event) => onNatureChange(event.target.value)}>
                      {NATURES.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <p className="muted-copy">{natureInfo}</p>
                  </>
                )}
              </div>
              <div>
                <span className="fact-label">{mode === 'battle' ? 'Available Abilities' : 'Abilities'}</span>
                <div className="ability-list">
                  {pokemon.abilities.map((ability) => (
                    <article key={`${pokemon.id}-${ability.slot}-${ability.name}`} className="ability-card">
                      <strong>{ability.name}</strong>
                      <span className="muted-copy">{ability.slot}</span>
                      <p>{ability.description || 'No description available from the source.'}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel">
            <p className="eyebrow">Base Stats</p>
            <div className="stat-list">
              {statEntries(pokemon.baseStats).map(([key, value]) => (
                <StatMeter key={`${pokemon.id}-${key}`} label={formatStatLabel(key)} value={value} />
              ))}
            </div>
          </article>

          <article className="profile-panel">
            <p className="eyebrow">Type Matchups</p>
            <div className="profile-matchups">
              <div>
                <span className="fact-label">Weak To</span>
                <div className="type-row">
                  {weak.length ? weak.map((entryItem) => <TypeChip key={`${pokemon.id}-${entryItem.type}-${entryItem.label}`} type={entryItem.type} accent stat={entryItem.label} />) : <span className="muted-copy">No direct weaknesses</span>}
                </div>
              </div>
              <div>
                <span className="fact-label">Resists / Immune</span>
                <div className="type-row">
                  {resist.length ? resist.map((entryItem) => <TypeChip key={`${pokemon.id}-${entryItem.type}-${entryItem.label}`} type={entryItem.type} soft stat={entryItem.label} />) : <span className="muted-copy">No resistances to show</span>}
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel">
            <p className="eyebrow">Dex Notes</p>
            <div className="profile-facts">
              <div>
                <span className="fact-label">Base Species</span>
                <p>{pokemon.baseSpecies}</p>
              </div>
              <div>
                <span className="fact-label">Height / Weight</span>
                <p>
                  {pokemon.heightm != null ? `${pokemon.heightm} m` : 'Unknown'} - {pokemon.weightkg != null ? `${pokemon.weightkg} kg` : 'Unknown'}
                </p>
              </div>
              <div>
                <span className="fact-label">Egg Groups</span>
                <p>{pokemon.eggGroups.length ? pokemon.eggGroups.join(', ') : 'Unknown'}</p>
              </div>
              {pokemon.requiredItem ? (
                <div>
                  <span className="fact-label">Required Item</span>
                  <p>{pokemon.requiredItem}</p>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function FormPickerOverlay({ family, mode, onClose, onSelect, regulationSet = DEFAULT_REGULATION_SET }) {
  const forms = filterPokemonFormsByRegulation(family, regulationSet);

  if (!forms.length) return null;

  const actionLabel = mode === 'drawer' ? 'Choose the form to assign to this slot.' : 'Choose the form to open in the profile view.';

  return (
    <div className="profile-backdrop" onClick={onClose}>
      <section className="form-picker-overlay" onClick={(event) => event.stopPropagation()}>
        <div className="profile-header">
          <div>
            <p className="eyebrow">Select a Form</p>
            <h2>{family.name}</h2>
            <p className="muted-copy">{actionLabel}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="form-picker-grid">
          {forms.map((pokemon) => (
            <button key={pokemon.id} type="button" className="result-card form-option-card" onClick={() => onSelect(pokemon.id)}>
              <PokemonArtwork pokemon={pokemon} className="result-artwork" />
              <div className="result-copy">
                <div className="result-headline">
                  <strong>{pokemon.name}</strong>
                  <span className="muted-copy">Gen {pokemon.gen}</span>
                </div>
                <div className="type-row">
                  {pokemon.types.map((type) => (
                    <TypeChip key={`${pokemon.id}-${type}`} type={type} soft />
                  ))}
                </div>
                <p className="result-meta">
                  {getFormLabel(pokemon, family.defaultFormId)} - BST {pokemon.bst}
                  {pokemon.tier ? ` - ${pokemon.tier}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamSlot({
  entry,
  side,
  isReplacementTarget,
  onClick,
  onContextMenu,
  onHover,
  onHoverLeave,
  onDragStart,
  onDragEnd,
}) {
  const label = entry.isActive ? 'Active' : entry.fainted ? 'Fainted' : side === 'player' ? 'Party' : 'Scouted';
  const slotTitle = entry.pokemon
    ? `Slot ${entry.rosterIndex + 1}: ${entry.pokemon.name} (${label})`
    : `Slot ${entry.rosterIndex + 1}: Add Pokemon`;

  if (!entry.pokemon) {
    return (
      <button className="team-slot team-slot-empty" type="button" onClick={onClick} aria-label={slotTitle}>
        <span className="team-slot-core">
          <span className="team-slot-plus">+</span>
        </span>
        <span className="team-slot-index">{entry.rosterIndex + 1}</span>
      </button>
    );
  }

  return (
    <button
      className={`team-slot${entry.isActive ? ' team-slot-active' : ''}${entry.fainted ? ' team-slot-fainted' : ''}${isReplacementTarget ? ' team-slot-highlight' : ''}`}
      type="button"
      draggable={!entry.fainted}
      aria-label={slotTitle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={(event) => onHover(entry, event.currentTarget)}
      onMouseLeave={onHoverLeave}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="team-slot-core">
        <PokemonBattleSprite pokemon={entry.pokemon} className="team-slot-sprite" compact />
      </span>
      <span className="team-slot-index">{entry.rosterIndex + 1}</span>
    </button>
  );
}

function TeamStrip({
  title,
  side,
  entries,
  replacementTargets,
  onSlotClick,
  onSlotContextMenu,
  onHover,
  onHoverLeave,
  onDragStart,
  onDragEnd,
}) {
  return (
    <section className={`team-strip team-strip-${side}`} style={{ '--slot-count': entries.length }}>
      <p className="team-strip-title">{title}</p>
      <div className="team-strip-grid">
        {entries.map((entry) => (
          <TeamSlot
            key={`${side}-${entry.rosterIndex}-${entry.pokemon?.id || 'empty'}`}
            entry={entry}
            side={side}
            isReplacementTarget={replacementTargets.has(entry.rosterIndex)}
            onClick={() => onSlotClick(side, entry.rosterIndex)}
            onContextMenu={(event) => onSlotContextMenu(event, side, entry.rosterIndex)}
            onHover={onHover}
            onHoverLeave={onHoverLeave}
            onDragStart={(event) => onDragStart(event, { side, source: 'roster', rosterIndex: entry.rosterIndex })}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
      <div className="team-strip-rail" />
    </section>
  );
}

function ActiveBattleSlot({
  side,
  entry,
  activePosition,
  canDrop,
  onClick,
  onContextMenu,
  onHover,
  onHoverLeave,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const label = `Active Slot ${activePosition + 1}`;

  return (
    <div
      className={`active-battle-slot active-battle-slot-${side}${entry?.pokemon ? '' : ' active-battle-slot-empty'}${canDrop ? ' active-battle-slot-droppable' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={entry?.pokemon ? (event) => onHover(entry, event.currentTarget) : undefined}
      onMouseLeave={entry?.pokemon ? onHoverLeave : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="active-battle-slot-label">{label}</span>

      {entry?.pokemon ? (
        <>
          <div
            className="active-battle-slot-body"
            draggable={!entry.fainted}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <PokemonBattleSprite pokemon={entry.pokemon} perspective={side === 'player' ? 'back' : 'front'} className="active-battle-sprite" />
          </div>
          <div className="active-battle-slot-footer">
            <strong>{entry.pokemon.name}</strong>
            <span className="muted-copy">{entry.ability || 'No ability data'}</span>
          </div>
        </>
      ) : (
        <div className="active-battle-empty-copy">
          <span>Waiting for a Pokemon</span>
          <p>Drag a party slot here or use the right-click menu.</p>
        </div>
      )}
    </div>
  );
}

function WeaknessSummaryPanel({ title, entries, emptyCopy }) {
  const filledEntries = entries.filter((entry) => entry?.pokemon);

  return (
    <section className="battle-info-card">
      <div className="battle-info-head">
        <h3>{title}</h3>
      </div>

      {filledEntries.length ? (
        <div className="battle-info-list">
          {filledEntries.map((entry) => {
            const weak = renderWeaknessChips(entry.buckets, 'weak');
            return (
              <article key={`${title}-${entry.pokemon.id}-${entry.activePosition}`} className="battle-info-entry">
                <div className="battle-info-entry-head">
                  <PokemonBattleSprite pokemon={entry.pokemon} className="battle-info-sprite" compact />
                  <strong>{entry.pokemon.name}</strong>
                </div>
                <div className="type-row">
                  {weak.length ? weak.map((item) => <TypeChip key={`${entry.pokemon.id}-${item.type}-${item.label}`} type={item.type} accent stat={item.label} />) : <span className="muted-copy">No direct weaknesses</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="battle-info-empty">{emptyCopy}</div>
      )}
    </section>
  );
}

function RecommendedTypePanel({ recommendations }) {
  return (
    <section className="battle-info-card">
      <div className="battle-info-head">
        <h3>Recommended Attack Type</h3>
      </div>

      {recommendations.length ? (
        <div className="recommendation-list">
          {recommendations.map((entry) => (
            <article key={entry.type} className="recommendation-entry">
              <TypeChip type={entry.type} accent stat={`${entry.hitCount} target${entry.hitCount > 1 ? 's' : ''}`} />
              <p className="muted-copy">
                {entry.details.map((detail) => `${detail.name} ${detail.multiplier}x`).join(' - ')}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="battle-info-empty">Set at least one active enemy Pokemon to surface attack recommendations.</div>
      )}
    </section>
  );
}

function ContextMenu({ menuState, actions, onClose }) {
  if (!menuState || !actions.length) return null;

  return (
    <div className="context-menu" style={{ left: menuState.x, top: menuState.y }} onClick={(event) => event.stopPropagation()}>
      {actions.map((action) => (
        <button
          key={action.label}
          className={`context-menu-item${action.danger ? ' context-menu-item-danger' : ''}`}
          type="button"
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [battleMode, setBattleMode] = useState(readStoredMode);
  const [regulationSet, setRegulationSet] = useState(DEFAULT_REGULATION_SET);
  const [playerTeam, setPlayerTeam] = useState(createDefaultTeamState);
  const [opponentTeam, setOpponentTeam] = useState(createDefaultTeamState);
  const [drawerState, setDrawerState] = useState({ open: false, side: 'player', rosterIndex: 0 });
  const [formPickerState, setFormPickerState] = useState(null);
  const [profileState, setProfileState] = useState(null);
  const [searchProfileState, setSearchProfileState] = useState({ pokemonId: '', nature: DEFAULT_NATURE });
  const [hoverState, setHoverState] = useState(null);
  const [contextMenuState, setContextMenuState] = useState(null);
  const [replacementState, setReplacementState] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [updateState, setUpdateState] = useState({ version: APP_VERSION, status: 'idle', detail: '' });
  const [dataState, setDataState] = useState({ status: 'loading', data: null, error: '' });

  useEffect(() => {
    let cancelled = false;

    loadBattleDex()
      .then((data) => {
        if (cancelled) return;
        setDataState({ status: 'ready', data, error: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        setDataState({
          status: 'error',
          data: null,
          error: error?.message || 'Failed to load app data.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    clearStoredSessionState();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BATTLE_MODE_KEY, battleMode);
    } catch {}
  }, [battleMode]);

  const visibleTeamSize = getTeamSize(battleMode);
  const visibleActiveCount = getActiveCount(battleMode);

  useEffect(() => {
    if (!contextMenuState) return undefined;

    const closeMenu = () => setContextMenuState(null);
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setContextMenuState(null);
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenuState]);

  useEffect(() => {
    setHoverState(null);
    setDragState(null);
    setContextMenuState((current) => {
      if (!current) return null;
      if (current.scope === 'roster' && current.rosterIndex >= visibleTeamSize) return null;
      if (current.scope === 'active' && current.activePosition >= visibleActiveCount) return null;
      return current;
    });
    setDrawerState((current) => {
      if (!current.open || current.rosterIndex < visibleTeamSize) return current;
      return { ...current, open: false };
    });
    setFormPickerState((current) => {
      if (!current || current.mode !== 'drawer' || current.rosterIndex < visibleTeamSize) return current;
      return null;
    });
    setProfileState((current) => {
      if (!current || current.rosterIndex < visibleTeamSize) return current;
      return null;
    });
    setReplacementState((current) => {
      if (!current || current.activePosition < visibleActiveCount) return current;
      return null;
    });
  }, [visibleActiveCount, visibleTeamSize]);

  useEffect(() => {
    let offChecking = () => {};
    let offAvailable = () => {};
    let offDownloaded = () => {};
    let offNotAvailable = () => {};
    let offError = () => {};

    async function loadUpdateContext() {
      let version = '';
      let snapshot = null;

      try {
        version = (await window.app?.getVersion?.()) || '';
      } catch {}

      try {
        snapshot = await window.app?.getUpdateState?.();
      } catch {}

      setUpdateState((current) => {
        const nextVersion = version || snapshot?.current || current.version;
        if (snapshot) {
          return resolveUpdateState(
            {
              ...snapshot,
              current: snapshot.current || nextVersion,
            },
            nextVersion,
          );
        }

        return nextVersion ? { ...current, version: nextVersion } : current;
      });
    }

    loadUpdateContext();

    offChecking = window.app?.onCheckingForUpdate?.(() => {
      setUpdateState((current) =>
        resolveUpdateState({ status: 'checking', current: current.version }, current.version),
      );
    }) || offChecking;
    offAvailable = window.app?.onUpdateAvailable?.((version) => {
      setUpdateState((current) =>
        resolveUpdateState(
          { status: 'downloading', current: current.version, version },
          current.version,
        ),
      );
    }) || offAvailable;
    offDownloaded = window.app?.onUpdateDownloaded?.((version) => {
      setUpdateState((current) =>
        resolveUpdateState(
          { status: 'downloaded', current: current.version, version },
          current.version,
        ),
      );
    }) || offDownloaded;
    offNotAvailable = window.app?.onUpdateNotAvailable?.(() => {
      setUpdateState((current) =>
        resolveUpdateState({ status: 'current', current: current.version }, current.version),
      );
    }) || offNotAvailable;
    offError = window.app?.onUpdateError?.((message) => {
      setUpdateState((current) =>
        resolveUpdateState(
          { status: 'error', current: current.version, message },
          current.version,
        ),
      );
    }) || offError;

    return () => {
      offChecking();
      offAvailable();
      offDownloaded();
      offNotAvailable();
      offError();
    };
  }, []);

  const byId = dataState.data?.byId || {};
  const familiesById = dataState.data?.familiesById || {};
  const typeChart = dataState.data?.typeChart || {};
  const playerView = buildTeamView(playerTeam, byId, typeChart, battleMode);
  const opponentView = buildTeamView(opponentTeam, byId, typeChart, battleMode);
  const replacementCandidates = {
    player: new Set(replacementState?.side === 'player' ? getReplacementCandidates(playerView).map((entry) => entry.rosterIndex) : []),
    opponent: new Set(replacementState?.side === 'opponent' ? getReplacementCandidates(opponentView).map((entry) => entry.rosterIndex) : []),
  };
  const recommendedTypes = computeAttackRecommendations(opponentView.activeEntries, typeChart);
  const drawerSelectedEntry = drawerState.side === 'player' ? playerView.rosterEntries[drawerState.rosterIndex] : opponentView.rosterEntries[drawerState.rosterIndex];
  const activeFormFamily = formPickerState?.familyId ? familiesById[formPickerState.familyId] || null : null;
  const hasBattlefieldSelections = [...playerTeam.roster, ...opponentTeam.roster].some((slot) => slot?.pokemonId);

  function getTeamView(side) {
    return side === 'player' ? playerView : opponentView;
  }

  function updateTeam(side, updater) {
    const setter = side === 'player' ? setPlayerTeam : setOpponentTeam;
    startTransition(() => {
      setter((current) => normalizeTeamState(updater(current)));
    });
  }

  function setPokemonForSlot(side, rosterIndex, pokemonId) {
    const needsReplacement = replacementState?.side === side;
    const targetReplacementPosition = needsReplacement ? replacementState.activePosition : null;
    const pokemon = pokemonId ? byId[pokemonId] || null : null;

    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      next.roster[rosterIndex] = {
        ...next.roster[rosterIndex],
        pokemonId,
        ability: getDefaultAbilityName(pokemon),
        fainted: false,
      };

      if (!pokemonId) {
        next.roster[rosterIndex] = createEmptyRosterSlot();
        next.activeSlots = next.activeSlots.map((value) => (value === rosterIndex ? null : value));
        return next;
      }

      if (targetReplacementPosition != null && next.activeSlots[targetReplacementPosition] == null) {
        next.activeSlots[targetReplacementPosition] = rosterIndex;
      } else if (!next.activeSlots.includes(rosterIndex)) {
        for (let position = 0; position < getActiveCount(battleMode); position += 1) {
          if (next.activeSlots[position] == null) {
            next.activeSlots[position] = rosterIndex;
            break;
          }
        }
      }

      return next;
    });

    if (needsReplacement && pokemonId) {
      setReplacementState(null);
    }
  }

  function clearSlot(side, rosterIndex) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      next.roster[rosterIndex] = createEmptyRosterSlot();
      next.activeSlots = next.activeSlots.map((value) => (value === rosterIndex ? null : value));
      return next;
    });

    if (profileState?.side === side && profileState?.rosterIndex === rosterIndex) {
      setProfileState(null);
    }
  }

  function clearAllTeams() {
    startTransition(() => {
      setPlayerTeam(createDefaultTeamState());
      setOpponentTeam(createDefaultTeamState());
    });
    setDrawerState((current) => ({ ...current, open: false }));
    setFormPickerState(null);
    setProfileState(null);
    setHoverState(null);
    setContextMenuState(null);
    setReplacementState(null);
    setDragState(null);
  }

  function restoreFaintedPokemon(side, rosterIndex) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      if (!next.roster[rosterIndex]?.pokemonId) return next;
      next.roster[rosterIndex].fainted = false;
      return next;
    });
  }

  function setNatureForSlot(side, rosterIndex, nature) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      next.roster[rosterIndex] = {
        ...next.roster[rosterIndex],
        nature,
      };
      return next;
    });
  }

  function setAbilityForSlot(side, rosterIndex, ability) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      next.roster[rosterIndex] = {
        ...next.roster[rosterIndex],
        ability,
      };
      return next;
    });
  }

  function assignActiveSlot(side, activePosition, rosterIndex) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      const slot = next.roster[rosterIndex];

      if (!slot?.pokemonId || slot.fainted) return next;

      const sourcePosition = next.activeSlots.findIndex((value) => value === rosterIndex);
      const targetValue = next.activeSlots[activePosition] ?? null;

      if (sourcePosition !== -1 && sourcePosition !== activePosition) {
        next.activeSlots[sourcePosition] = targetValue;
      }

      next.activeSlots[activePosition] = rosterIndex;
      return next;
    });

    if (replacementState?.side === side && replacementState.activePosition === activePosition) {
      setReplacementState(null);
    }
  }

  function markActivePokemonFainted(side, activePosition) {
    updateTeam(side, (current) => {
      const next = cloneTeamState(current);
      const rosterIndex = next.activeSlots[activePosition];
      if (rosterIndex == null) return next;

      next.roster[rosterIndex].fainted = true;
      next.activeSlots[activePosition] = null;
      return next;
    });

    setReplacementState({ side, activePosition });
  }

  function openProfile(side, rosterIndex) {
    const entry = getTeamView(side).rosterEntries[rosterIndex];
    if (!entry?.pokemon) return;
    setContextMenuState(null);
    setProfileState({ side, rosterIndex });
  }

  function openSearchProfile(pokemonId) {
    setSearchProfileState({
      pokemonId,
      nature: DEFAULT_NATURE,
    });
  }

  function openSearch(side, rosterIndex) {
    setContextMenuState(null);
    setDrawerState({ open: true, side, rosterIndex });
  }

  function handleCatalogResultSelect(pokemon) {
    const selectableForms = filterPokemonFormsByRegulation(pokemon, regulationSet);

    if (selectableForms.length > 1) {
      setFormPickerState({
        familyId: pokemon.familyId,
        mode: 'search',
      });
      return;
    }

    openSearchProfile((selectableForms[0] || pokemon).id);
  }

  function handleDrawerResultSelect(pokemon) {
    const selectableForms = filterPokemonFormsByRegulation(pokemon, regulationSet);

    if (selectableForms.length > 1) {
      setFormPickerState({
        familyId: pokemon.familyId,
        mode: 'drawer',
        side: drawerState.side,
        rosterIndex: drawerState.rosterIndex,
      });
      return;
    }

    setPokemonForSlot(drawerState.side, drawerState.rosterIndex, (selectableForms[0] || pokemon).id);
    setDrawerState((current) => ({ ...current, open: false }));
  }

  function handleFormSelect(pokemonId) {
    if (!formPickerState) return;

    if (formPickerState.mode === 'drawer') {
      setPokemonForSlot(formPickerState.side, formPickerState.rosterIndex, pokemonId);
      setDrawerState((current) => ({ ...current, open: false }));
      setFormPickerState(null);
      return;
    }

    openSearchProfile(pokemonId);
    setFormPickerState(null);
  }

  function handleHover(entry, element) {
    if (!entry?.pokemon) return;
    const rect = element.getBoundingClientRect();
    setHoverState({
      ...entry,
      position: {
        x: Math.min(window.innerWidth - 340, rect.right + 16),
        y: Math.max(20, rect.top),
      },
    });
  }

  function openActiveProfile(side, activePosition) {
    const entry = getTeamView(side).activeEntries[activePosition];
    if (!entry?.pokemon || entry.rosterIndex == null) return;
    openProfile(side, entry.rosterIndex);
  }

  function handleTeamSlotClick(side, rosterIndex) {
    const entry = getTeamView(side).rosterEntries[rosterIndex];

    if (!entry?.pokemon) {
      openSearch(side, rosterIndex);
      return;
    }

    if (replacementState?.side === side && replacementCandidates[side].has(rosterIndex)) {
      assignActiveSlot(side, replacementState.activePosition, rosterIndex);
      return;
    }

    openProfile(side, rosterIndex);
  }

  function openContextMenu(event, nextState) {
    event.preventDefault();
    event.stopPropagation();

    const x = Math.min(window.innerWidth - CONTEXT_MENU_WIDTH - 12, event.clientX);
    const y = Math.min(window.innerHeight - CONTEXT_MENU_HEIGHT - 12, event.clientY);

    setContextMenuState({
      ...nextState,
      x: Math.max(12, x),
      y: Math.max(12, y),
    });
  }

  function handleSlotContextMenu(event, side, rosterIndex) {
    const entry = getTeamView(side).rosterEntries[rosterIndex];

    if (!entry?.pokemon) {
      openSearch(side, rosterIndex);
      return;
    }

    openContextMenu(event, {
      scope: 'roster',
      side,
      rosterIndex,
    });
  }

  function handleActiveContextMenu(event, side, activePosition) {
    const entry = getTeamView(side).activeEntries[activePosition];
    if (!entry?.pokemon) return;

    openContextMenu(event, {
      scope: 'active',
      side,
      activePosition,
    });
  }

  function handleDragStart(event, payload) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    setDragState(payload);
  }

  function handleDragEnd() {
    setDragState(null);
  }

  function parseDragPayload(event) {
    try {
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getDraggedRosterIndex(payload) {
    if (!payload) return null;

    const teamView = getTeamView(payload.side);

    if (payload.source === 'roster') {
      return payload.rosterIndex;
    }

    if (payload.source === 'active') {
      return teamView.visibleActiveSlots[payload.activePosition] ?? null;
    }

    return null;
  }

  function handleDropToActive(event, side, activePosition) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    setDragState(null);

    if (!payload || payload.side !== side) return;

    const rosterIndex = getDraggedRosterIndex(payload);
    if (rosterIndex == null) return;

    assignActiveSlot(side, activePosition, rosterIndex);
  }

  async function handleCheckUpdates() {
    setUpdateState((current) =>
      resolveUpdateState({ status: 'checking', current: current.version }, current.version),
    );

    try {
      const result = await window.app?.checkForUpdates?.();
      if (!result) {
        setUpdateState((current) =>
          resolveUpdateState(
            { status: 'error', current: current.version, message: 'Updater bridge unavailable.' },
            current.version,
          ),
        );
        return;
      }

      setUpdateState((current) =>
        resolveUpdateState(
          {
            ...result,
            current: result.current || current.version,
          },
          current.version,
        ),
      );
    } catch (error) {
      setUpdateState((current) =>
        resolveUpdateState(
          { status: 'error', current: current.version, message: error?.message || 'Update check failed.' },
          current.version,
        ),
      );
    }
  }

  async function handleInstallUpdate() {
    try {
      await window.app?.installUpdate?.();
    } catch (error) {
      setUpdateState((current) =>
        resolveUpdateState(
          {
            status: 'error',
            current: current.version,
            message: error?.message || 'Unable to install the downloaded update.',
          },
          current.version,
        ),
      );
    }
  }

  const profileEntry =
    profileState?.side === 'player'
      ? playerView.rosterEntries[profileState.rosterIndex] || null
      : profileState?.side === 'opponent'
        ? opponentView.rosterEntries[profileState.rosterIndex] || null
        : null;

  const searchProfileEntry = searchProfileState.pokemonId
    ? {
        rosterIndex: null,
        pokemon: byId[searchProfileState.pokemonId] || null,
        nature: searchProfileState.nature,
        fainted: false,
        isActive: false,
        buckets: byId[searchProfileState.pokemonId]
          ? computeTypeBuckets(byId[searchProfileState.pokemonId].types, typeChart)
          : null,
      }
    : null;

  const activeProfileEntry = activeTab === 'search' ? searchProfileEntry : profileEntry;
  const replacementCopy = replacementState
    ? replacementCandidates[replacementState.side].size
      ? `${sideLabel(replacementState.side)} needs a replacement for Active Slot ${replacementState.activePosition + 1}. Click or drag one of the highlighted Pokemon into the field.`
      : `${sideLabel(replacementState.side)} has no healthy bench Pokemon available for Active Slot ${replacementState.activePosition + 1}.`
    : '';

  const contextMenuActions = (() => {
    if (!contextMenuState) return [];

    const teamView = getTeamView(contextMenuState.side);

    if (contextMenuState.scope === 'active') {
      const entry = teamView.activeEntries[contextMenuState.activePosition];
      if (!entry?.pokemon || entry.rosterIndex == null) return [];

      return [
        {
          label: 'Mark as Fainted',
          onSelect: () => markActivePokemonFainted(contextMenuState.side, contextMenuState.activePosition),
          danger: true,
        },
        {
          label: 'View Details',
          onSelect: () => openProfile(contextMenuState.side, entry.rosterIndex),
        },
        {
          label: 'Remove from Team',
          onSelect: () => clearSlot(contextMenuState.side, entry.rosterIndex),
          danger: true,
        },
      ];
    }

    const entry = teamView.rosterEntries[contextMenuState.rosterIndex];
    if (!entry?.pokemon) {
      return [
        {
          label: 'Add Pokemon',
          onSelect: () => openSearch(contextMenuState.side, contextMenuState.rosterIndex),
        },
      ];
    }

    const actions = [];

    if (replacementState?.side === contextMenuState.side && replacementCandidates[contextMenuState.side].has(contextMenuState.rosterIndex)) {
      actions.push({
        label: `Send Out to Active Slot ${replacementState.activePosition + 1}`,
        onSelect: () => assignActiveSlot(contextMenuState.side, replacementState.activePosition, contextMenuState.rosterIndex),
      });
    }

    if (entry.fainted) {
      actions.push({
        label: 'Restore from Fainted',
        onSelect: () => restoreFaintedPokemon(contextMenuState.side, contextMenuState.rosterIndex),
      });
    } else if (entry.isActive) {
      actions.push({
        label: 'Mark as Fainted',
        onSelect: () => markActivePokemonFainted(contextMenuState.side, entry.activePosition),
        danger: true,
      });
    } else {
      teamView.activeEntries.forEach((activeEntry, activePosition) => {
        if (!activeEntry?.pokemon) {
          actions.push({
            label: `Set Active (Slot ${activePosition + 1})`,
            onSelect: () => assignActiveSlot(contextMenuState.side, activePosition, contextMenuState.rosterIndex),
          });
        } else {
          actions.push({
            label: `Swap with ${activeEntry.pokemon.name}`,
            onSelect: () => assignActiveSlot(contextMenuState.side, activePosition, contextMenuState.rosterIndex),
          });
        }
      });
    }

    actions.push({
      label: 'View Details',
      onSelect: () => openProfile(contextMenuState.side, contextMenuState.rosterIndex),
    });
    actions.push({
      label: 'Replace Pokemon',
      onSelect: () => openSearch(contextMenuState.side, contextMenuState.rosterIndex),
    });
    actions.push({
      label: 'Remove from Team',
      onSelect: () => clearSlot(contextMenuState.side, contextMenuState.rosterIndex),
      danger: true,
    });

    return actions;
  })();
  const updateActionDisabled =
    updateState.status === 'checking' || updateState.status === 'downloading';
  const updateActionLabel =
    updateState.status === 'checking'
      ? 'Checking...'
      : updateState.status === 'downloading'
        ? 'Downloading...'
        : 'Check Updates';

  return (
    <div className="app-shell">
      <div className="halo halo-left" />
      <div className="halo halo-right" />

      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src={logo} alt="3's PokeChamp Tool" />
          </div>
          <div className="brand-title-row">
            <h1>3&apos;s PokeChamp Tool</h1>
          </div>
        </div>

        <nav className="tab-bar header-tabs" aria-label="Primary">
          <button
            className={`tab-button${activeTab === 'search' ? ' tab-button-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('search')}
          >
            Pokemon Search
          </button>
          <button
            className={`tab-button${activeTab === 'items' ? ' tab-button-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('items')}
          >
            Items
          </button>
          <button
            className={`tab-button${activeTab === 'battle' ? ' tab-button-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('battle')}
          >
            Battle
          </button>
        </nav>

        <div className="header-controls">
          {activeTab === 'battle' ? (
            <div className="mode-toggle battle-mode-toggle battle-mode-toggle-header">
              <span className="fact-label">Battle Mode</span>
              <div className="toggle-row">
                <button className={`toggle-button${battleMode === '1v1' ? ' toggle-button-active' : ''}`} type="button" onClick={() => setBattleMode('1v1')}>
                  1v1
                </button>
                <button className={`toggle-button${battleMode === '2v2' ? ' toggle-button-active' : ''}`} type="button" onClick={() => setBattleMode('2v2')}>
                  2v2
                </button>
              </div>
            </div>
          ) : null}

          <div className="update-panel">
            <span className="fact-label">Version</span>
            <strong>v{updateState.version}</strong>
            {updateState.detail ? <p className="muted-copy">{updateState.detail}</p> : null}
            {updateState.status === 'downloaded' ? (
              <button className="primary-button" type="button" onClick={handleInstallUpdate}>
                Install Update
              </button>
            ) : (
              <button
                className="ghost-button"
                type="button"
                onClick={handleCheckUpdates}
                disabled={updateActionDisabled}
              >
                {updateActionLabel}
              </button>
            )}
          </div>
        </div>
      </header>

      {dataState.status === 'loading' ? <div className="status-banner">Loading data...</div> : null}
      {dataState.status === 'error' ? <div className="status-banner status-banner-error">{dataState.error}</div> : null}

      <main className="app-main">
        {activeTab === 'search' ? (
          <PokemonSearchTab
            dataState={dataState}
            onOpenProfile={handleCatalogResultSelect}
            regulationSet={regulationSet}
            onRegulationChange={setRegulationSet}
          />
        ) : activeTab === 'items' ? (
          <ItemSearchTab dataState={dataState} />
        ) : (
          <section className="battle-board">
            <div className="battle-board-head">
              <div>
                <p className="eyebrow">Battle Screen</p>
                <h2>Field Planner</h2>
              </div>
              <button className="ghost-button battle-clear-button" type="button" onClick={clearAllTeams} disabled={!hasBattlefieldSelections}>
                Clear All
              </button>
            </div>

            {replacementCopy ? <div className="replacement-banner">{replacementCopy}</div> : null}

            <div className="battlefield-shell">
              <section className={`battlefield-arena battlefield-arena-${battleMode}`}>
                <div className="battlefield-gradient battlefield-gradient-top" />
                <div className="battlefield-gradient battlefield-gradient-bottom" />
                <TeamStrip
                  title="Enemy Team"
                  side="opponent"
                  entries={opponentView.rosterEntries}
                  replacementTargets={replacementCandidates.opponent}
                  onSlotClick={handleTeamSlotClick}
                  onSlotContextMenu={handleSlotContextMenu}
                  onHover={handleHover}
                  onHoverLeave={() => setHoverState(null)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />

                <div className="battlefield-side battlefield-side-opponent">
                  <div className={`battlefield-side-inner battlefield-side-inner-${battleMode}`}>
                    {opponentView.activeEntries.map((entry, activePosition) => (
                      <ActiveBattleSlot
                        key={`opponent-active-${activePosition}-${entry.pokemon?.id || 'empty'}`}
                        side="opponent"
                        entry={entry}
                        activePosition={activePosition}
                        canDrop={dragState?.side === 'opponent'}
                        onClick={() => openActiveProfile('opponent', activePosition)}
                        onContextMenu={(event) => handleActiveContextMenu(event, 'opponent', activePosition)}
                        onHover={handleHover}
                        onHoverLeave={() => setHoverState(null)}
                        onDragStart={(event) => handleDragStart(event, { side: 'opponent', source: 'active', activePosition })}
                        onDragEnd={handleDragEnd}
                        onDragOver={(event) => {
                          if (dragState?.side === 'opponent') {
                            event.preventDefault();
                          }
                        }}
                        onDrop={(event) => handleDropToActive(event, 'opponent', activePosition)}
                      />
                    ))}
                  </div>
                </div>

                <div className="battlefield-center-copy">
                  <strong>{battleMode === '2v2' ? 'Double Battle' : 'Single Battle'}</strong>
                </div>

                <div className="battlefield-side battlefield-side-player">
                  <div className={`battlefield-side-inner battlefield-side-inner-${battleMode}`}>
                    {playerView.activeEntries.map((entry, activePosition) => (
                      <ActiveBattleSlot
                        key={`player-active-${activePosition}-${entry.pokemon?.id || 'empty'}`}
                        side="player"
                        entry={entry}
                        activePosition={activePosition}
                        canDrop={dragState?.side === 'player'}
                        onClick={() => openActiveProfile('player', activePosition)}
                        onContextMenu={(event) => handleActiveContextMenu(event, 'player', activePosition)}
                        onHover={handleHover}
                        onHoverLeave={() => setHoverState(null)}
                        onDragStart={(event) => handleDragStart(event, { side: 'player', source: 'active', activePosition })}
                        onDragEnd={handleDragEnd}
                        onDragOver={(event) => {
                          if (dragState?.side === 'player') {
                            event.preventDefault();
                          }
                        }}
                        onDrop={(event) => handleDropToActive(event, 'player', activePosition)}
                      />
                    ))}
                  </div>
                </div>

                <TeamStrip
                  title="Your Team"
                  side="player"
                  entries={playerView.rosterEntries}
                  replacementTargets={replacementCandidates.player}
                  onSlotClick={handleTeamSlotClick}
                  onSlotContextMenu={handleSlotContextMenu}
                  onHover={handleHover}
                  onHoverLeave={() => setHoverState(null)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </section>
            </div>

            <div className="battle-info-grid">
              <WeaknessSummaryPanel
                title="Enemy Weaknesses"
                entries={opponentView.activeEntries}
                emptyCopy="Set enemy actives to show matchup weaknesses."
              />
              <WeaknessSummaryPanel
                title="Team Weaknesses"
                entries={playerView.activeEntries}
                emptyCopy="Set your active Pokemon to show your side's weaknesses."
              />
              <RecommendedTypePanel recommendations={recommendedTypes} />
            </div>
          </section>
        )}
      </main>

      <SearchDrawer
        dataState={dataState}
        drawerState={drawerState}
        selectedEntry={drawerSelectedEntry}
        regulationSet={regulationSet}
        onRegulationChange={setRegulationSet}
        onClose={() => setDrawerState((current) => ({ ...current, open: false }))}
        onClear={() => {
          clearSlot(drawerState.side, drawerState.rosterIndex);
          setDrawerState((current) => ({ ...current, open: false }));
        }}
        onChoose={handleDrawerResultSelect}
      />

      <FormPickerOverlay
        family={activeFormFamily}
        mode={formPickerState?.mode}
        regulationSet={regulationSet}
        onClose={() => setFormPickerState(null)}
        onSelect={handleFormSelect}
      />

      <ProfileOverlay
        entry={activeProfileEntry}
        mode={activeTab === 'battle' ? 'battle' : 'search'}
        onClose={() => {
          setProfileState(null);
          setSearchProfileState({ pokemonId: '', nature: DEFAULT_NATURE });
        }}
        onNatureChange={(nature) => {
          if (activeTab === 'search') {
            setSearchProfileState((current) => ({ ...current, nature }));
            return;
          }
          if (!profileState) return;
          setNatureForSlot(profileState.side, profileState.rosterIndex, nature);
        }}
        onAbilityChange={(ability) => {
          if (activeTab !== 'battle' || !profileState) return;
          setAbilityForSlot(profileState.side, profileState.rosterIndex, ability);
        }}
      />

      {activeTab === 'battle' ? <HoverCard hoverState={hoverState} /> : null}
      <ContextMenu menuState={contextMenuState} actions={contextMenuActions} onClose={() => setContextMenuState(null)} />
    </div>
  );
}
