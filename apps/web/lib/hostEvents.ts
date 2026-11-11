// Shared by the host page server component and OrganizerDetailClient. It must
// not live in the "use client" module: a server component importing a value
// from there gets a client reference, not the number.
export const HOST_EVENTS_PAGE_SIZE = 10;
