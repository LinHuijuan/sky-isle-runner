export type SkinId = 'jade' | 'pyro' | 'cryo' | 'electro';

export type SkinTheme = {
  id: SkinId;
  name: string;
  cloth: string;
  armor: string;
  armorDeep: string;
  gold: string;
  accent: string;
  accentEmissive: string;
  trail: string;
  hair: string;
  cape: string;
};

export const SKINS: SkinTheme[] = [
  {
    id: 'jade',
    name: '翡翠',
    cloth: '#f0ebe0',
    armor: '#2a9a88',
    armorDeep: '#146058',
    gold: '#e0c070',
    accent: '#6ef0ff',
    accentEmissive: '#1a8090',
    trail: '#7af0ff',
    hair: '#5a4060',
    cape: '#1a6b60',
  },
  {
    id: 'pyro',
    name: '火红',
    cloth: '#f5e6d8',
    armor: '#c43c30',
    armorDeep: '#7a2018',
    gold: '#f0b060',
    accent: '#ff8a50',
    accentEmissive: '#aa3000',
    trail: '#ff7040',
    hair: '#6a3028',
    cape: '#a02818',
  },
  {
    id: 'cryo',
    name: '冰蓝',
    cloth: '#eef4fa',
    armor: '#4a90c8',
    armorDeep: '#1a4070',
    gold: '#c8d8e8',
    accent: '#9af0ff',
    accentEmissive: '#2080b0',
    trail: '#80e8ff',
    hair: '#3a5078',
    cape: '#2a6090',
  },
  {
    id: 'electro',
    name: '雷紫',
    cloth: '#f0eaf8',
    armor: '#6a40b0',
    armorDeep: '#3a1868',
    gold: '#d8b0f0',
    accent: '#c880ff',
    accentEmissive: '#6020a0',
    trail: '#b070ff',
    hair: '#4a2868',
    cape: '#502890',
  },
];

export function getSkin(id: SkinId): SkinTheme {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
