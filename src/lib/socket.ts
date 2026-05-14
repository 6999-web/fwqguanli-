export function emitSocketEvent(event: string, payload: unknown) {
  const io = (globalThis as unknown as {
    io?: { emit: (eventName: string, data: unknown) => void };
  }).io;
  io?.emit(event, payload);
}
