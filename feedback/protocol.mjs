export const FEEDBACK_PATH = '/api/feedback';
export const TURNSTILE_ACTION = 'website_feedback';
export const MAX_FEEDBACK_LENGTH = 2000;
export const MAX_SOURCE_LENGTH = 2048;
export const MAX_TOKEN_LENGTH = 2048;
export const ISSUE_MARKER = '<!-- website-feedback:v1 -->';
export const ISSUE_TITLE = '[网站反馈] 待人工审查';
export const GITHUB_API_VERSION = '2022-11-28';

export function isRepository(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(value)) {
    return false;
  }
  const name = value.split('/')[1];
  return name !== '.' && name !== '..';
}

export function literalMarkdown(text) {
  return text.replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
      character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');
}
