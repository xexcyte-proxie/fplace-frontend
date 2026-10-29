import { afterEach, describe, expect, it, vi } from 'vitest';
import { VenuesLocalDatasource } from './venues-local-datasource';
import { ForumRepositoryImpl } from '../forum-repository-impl';
import records from '../local-venues.json';
import { venueMapLoadRequest } from '../../domain/venue-map-source';
import { listAllVenues, getForumVenue } from '../../../services/forum-service';

afterEach(() => vi.unstubAllGlobals());

const requested = [
  ['Airport', '6686b845c9f6d600bc30300'],
  ['Arena Demo', '672a6f4f3a45ba000b893e1c'],
  ['Community Centre Demo', '660c0bb9ae0596d87766f2d9'],
  ['Craft Show Demo', '67bf60e9679a9d000bfacd6f'],
  ['Event Space Demo', '660c0c3aae0596d87766f2da'],
  ['Grocery Store Demo', '6679882a8298d5000b85ee89'],
  ['Hospital Demo', '67881b4666a208000badecc4'],
  ['Mall Demo - Consumer', '660c0c6e7c0c4fe5b4cc484c'],
  ['Mall Demo - Facility', '65c0ff7430b94e3fabd5bb8c'],
  ['Multifamily Mid-Rise', '666ca6a48dd908000bf47803'],
  ['Multifamily High-Rise', '67a6641530e940000bac3c1a'],
];

describe('bundled venue catalog', () => {
  it.each(requested)('preserves the requested map for %s', async (name, mapId) => {
    const venues = await listAllVenues();
    const matches = venues.filter((venue) => venue.name === name);
    expect(matches).toHaveLength(1);
    const venue = await getForumVenue(matches[0].id);
    expect(venue.mappedin_map_id).toBe(mapId);
    expect(venueMapLoadRequest({ mappedinMapId: venue.mappedin_map_id })).toEqual({ mapId });
  });

  it('loads the complete contract through the repository without network or browser storage', async () => {
    const fetch = vi.fn(() => { throw new Error('Offline'); });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('indexedDB', undefined);
    const repository = new ForumRepositoryImpl();
    const page = await repository.listVenues();
    expect(page).toEqual({ count: 12, next: null, previous: null, results: records });
    expect(await listAllVenues()).toEqual(records);
    expect(await repository.getVenue(18)).toEqual(records.find((venue) => venue.id === 18));
    expect(fetch).not.toHaveBeenCalled();
    expect(new Set(page.results.map((venue) => venue.id)).size).toBe(12);
  });

  it('preserves Riverside Stadium independently of the venue sharing its map', async () => {
    const datasource = new VenuesLocalDatasource();
    const riverside = await datasource.getVenue(18);
    const mall = await datasource.getVenue(14);
    expect(riverside).toMatchObject({ name: 'Riverside Stadium', location: '1 Riverside Way' });
    expect(riverside.mappedin_map_id).toBe(mall.mappedin_map_id);
    expect(riverside.id).not.toBe(mall.id);
  });

  it('excludes LTV8 from listing and lookup without modifying input records', async () => {
    const ltv8 = { ...records[0], id: 999, name: ' LTV8 ' };
    const datasource = new VenuesLocalDatasource([...records, ltv8]);
    expect((await datasource.listVenues()).results).toEqual(records);
    await expect(datasource.getVenue(999)).rejects.toThrow('Could not load that venue.');
    expect(ltv8.mappedin_map_id).toBe(records[0].mappedin_map_id);
  });

  it('handles missing IDs, empty catalogs, and exhausted pages', async () => {
    const datasource = new VenuesLocalDatasource([]);
    expect(await datasource.listVenues()).toEqual({ count: 0, next: null, previous: null, results: [] });
    await expect(datasource.getVenue(6)).rejects.toThrow('Could not load that venue.');
    expect((await new VenuesLocalDatasource().listVenues(2)).results).toEqual([]);
    await expect(datasource.listVenues(0)).rejects.toThrow('Invalid venue page.');
  });

  it('rejects duplicate venue IDs instead of silently replacing existing venues', () => {
    expect(() => new VenuesLocalDatasource([records[0], records[0]])).toThrow('duplicate venue ID');
  });

  it('isolates consumer edits and reconstructs the same catalog after reload', async () => {
    const datasource = new VenuesLocalDatasource();
    const page = await datasource.listVenues();
    page.results[0].name = 'Changed';
    const venue = await datasource.getVenue(6);
    venue.mappedin_map_id = 'Changed';
    expect((await datasource.listVenues()).results).toEqual(records);
    vi.resetModules();
    const reloaded = await import('./venues-local-datasource');
    expect((await reloaded.venuesLocalDatasource.listVenues()).results).toEqual(records);
  });

  it('bundles only venue metadata, with no credential fields', () => {
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([
        'id', 'name', 'location', 'latitude', 'longitude', 'mappedin_map_id',
        'notes', 'created_at', 'updated_at',
      ].sort());
      expect(JSON.stringify(record)).not.toMatch(/mik_|mis_|accessToken|secret|password/i);
    }
  });
});
