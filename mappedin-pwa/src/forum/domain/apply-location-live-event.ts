import type { LocationLiveEvent, LocationMessage } from './entities';

/**
 * Newest-first order for the conversation screen (matches the venue feed).
 */
export function sortLocationMessagesNewestFirst(
  messages: readonly LocationMessage[],
): LocationMessage[] {
  return [...messages].sort((left, right) => {
    const delta =
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    if (delta !== 0) return delta;
    return right.id - left.id;
  });
}

/** Dedupes by id, then newest-first — used for the venue-wide All conversations view. */
export function mergeLocationMessageLists(
  pages: readonly (readonly LocationMessage[])[],
): LocationMessage[] {
  const byId = new Map<number, LocationMessage>();
  for (const page of pages) {
    for (const message of page) {
      byId.set(message.id, message);
    }
  }
  return sortLocationMessagesNewestFirst([...byId.values()]);
}

export function mergeLiveLocationMessage(
  messages: readonly LocationMessage[],
  incoming: LocationMessage,
): LocationMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index < 0) {
    return [incoming, ...messages];
  }
  return messages.map((message, messageIndex) =>
    messageIndex === index ? incoming : message,
  );
}

/**
 * Pure location-room reducer. MapApp maps the resulting messages into the
 * conversation feed.
 */
export function applyLocationLiveEvent(
  messages: readonly LocationMessage[],
  event: LocationLiveEvent,
  locationId?: string,
): LocationMessage[] {
  if (event.type !== 'new_location_message') return [...messages];
  if (
    locationId &&
    event.message.location_id !== locationId
  ) {
    return [...messages];
  }
  return mergeLiveLocationMessage(messages, event.message);
}
