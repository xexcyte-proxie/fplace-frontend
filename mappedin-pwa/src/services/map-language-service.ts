/**
 * Map language façade — UI / MapApp talk to this module only for preference IO.
 */
import { languagePreferenceLocalDatasource } from '../map/data/datasources/language-preference-local-datasource';
import {
  getCurrentMapLanguage,
  getSupportedMapLanguages,
} from '../map/data/map-languages';
import type { MapLanguage } from '../map/domain/entities';

export type { MapLanguage };

export function loadPreferredMapLanguage(): string | null {
  return languagePreferenceLocalDatasource.load();
}

export function savePreferredMapLanguage(code: string): void {
  languagePreferenceLocalDatasource.save(code);
}

export { getCurrentMapLanguage, getSupportedMapLanguages };
