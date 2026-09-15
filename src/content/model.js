export const POST_CHANNELS = Object.freeze(['news', 'devlog']);

export function contentError(message, status = 422, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

export function assertPostChannel(channel) {
  const value = String(channel || '').trim().toLowerCase();
  if (!POST_CHANNELS.includes(value)) throw contentError('Unsupported content channel', 404);
  return value;
}
