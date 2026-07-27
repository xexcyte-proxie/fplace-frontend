import type { MapData } from '@mappedin/mappedin-js';

import type { MapLanguage } from '../domain/entities';

type LanguageLike = {
  code?: string;
  name?: string;
};

function toMapLanguage(entry: LanguageLike | null | undefined): MapLanguage | null {
  const code = entry?.code?.trim();
  if (!code) return null;
  const name = entry?.name?.trim() || code;
  return { code, name };
}

/** Languages configured for the venue in Mappedin CMS (enterprise maps only). */
export function getSupportedMapLanguages(mapData: MapData): MapLanguage[] {
  const venue = mapData.getByType('enterprise-venue') as
    | { languages?: LanguageLike[] }
    | undefined;
  const seen = new Set<string>();
  const languages: MapLanguage[] = [];

  for (const entry of venue?.languages ?? []) {
    const language = toMapLanguage(entry);
    if (!language || seen.has(language.code)) continue;
    seen.add(language.code);
    languages.push(language);
  }

  return languages;
}

export function getCurrentMapLanguage(mapData: MapData): MapLanguage | null {
  return toMapLanguage(mapData.currentLanguage as LanguageLike | undefined);
}
