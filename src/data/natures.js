export const NATURES = [
  { name: 'Hardy' },
  { name: 'Lonely', inc: 'Attack', dec: 'Defense' },
  { name: 'Brave', inc: 'Attack', dec: 'Speed' },
  { name: 'Adamant', inc: 'Attack', dec: 'Sp. Atk' },
  { name: 'Naughty', inc: 'Attack', dec: 'Sp. Def' },
  { name: 'Bold', inc: 'Defense', dec: 'Attack' },
  { name: 'Docile' },
  { name: 'Relaxed', inc: 'Defense', dec: 'Speed' },
  { name: 'Impish', inc: 'Defense', dec: 'Sp. Atk' },
  { name: 'Lax', inc: 'Defense', dec: 'Sp. Def' },
  { name: 'Timid', inc: 'Speed', dec: 'Attack' },
  { name: 'Hasty', inc: 'Speed', dec: 'Defense' },
  { name: 'Serious' },
  { name: 'Jolly', inc: 'Speed', dec: 'Sp. Atk' },
  { name: 'Naive', inc: 'Speed', dec: 'Sp. Def' },
  { name: 'Modest', inc: 'Sp. Atk', dec: 'Attack' },
  { name: 'Mild', inc: 'Sp. Atk', dec: 'Defense' },
  { name: 'Quiet', inc: 'Sp. Atk', dec: 'Speed' },
  { name: 'Bashful' },
  { name: 'Rash', inc: 'Sp. Atk', dec: 'Sp. Def' },
  { name: 'Calm', inc: 'Sp. Def', dec: 'Attack' },
  { name: 'Gentle', inc: 'Sp. Def', dec: 'Defense' },
  { name: 'Sassy', inc: 'Sp. Def', dec: 'Speed' },
  { name: 'Careful', inc: 'Sp. Def', dec: 'Sp. Atk' },
  { name: 'Quirky' },
];

export function getNature(name) {
  return NATURES.find((nature) => nature.name === name) || NATURES.find((nature) => nature.name === 'Serious');
}

export function describeNature(nature) {
  if (!nature?.inc && !nature?.dec) {
    return 'Neutral nature.';
  }

  if (nature?.inc && nature?.dec) {
    return `Raises ${nature.inc}, lowers ${nature.dec}.`;
  }

  if (nature?.inc) {
    return `Raises ${nature.inc}.`;
  }

  if (nature?.dec) {
    return `Lowers ${nature.dec}.`;
  }

  return 'Neutral nature.';
}
