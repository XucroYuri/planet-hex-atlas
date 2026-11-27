import { FEEDBACK_PATH, MAX_FEEDBACK_LENGTH, MAX_SOURCE_LENGTH, TURNSTILE_ACTION } from './protocol.mjs';

export const feedbackFormConfig = Object.freeze({
  path: FEEDBACK_PATH,
  action: TURNSTILE_ACTION,
  maxFeedbackLength: MAX_FEEDBACK_LENGTH,
  maxSourceLength: MAX_SOURCE_LENGTH,
});

export function submitFeedback(form, { signal } = {}) {
  const fields = new FormData(form);
  const endpoint = new URL(FEEDBACK_PATH, form.ownerDocument.location.origin);
  return fetch(endpoint, {
    method: 'POST',
    mode: 'same-origin',
    credentials: 'omit',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feedback: fields.get('feedback') ?? '',
      sourceUrl: fields.get('sourceUrl') ?? '',
      turnstileToken: fields.get('cf-turnstile-response') ?? '',
    }),
    signal,
  });
}
