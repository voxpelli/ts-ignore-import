import chalk from 'chalk';

const LOG_TITLE_PAD = 30;
const LOG_MESSAGE_PAD = 25;
const LOG_TITLE_PAD_LONG = LOG_TITLE_PAD + LOG_MESSAGE_PAD + 1;
const LOG_MESSAGE_PAD_LONG = LOG_MESSAGE_PAD + 10;

/**
 * @param {'log'|'error'} level
 * @param {string} title
 * @param {string} [message]
 * @param {string} [extras]
 * @param {boolean} [dimItAll]
 * @returns {void}
 */
export const log = (level, title, message, extras, dimItAll) => {
  /** @type {string} */
  let resolvedMessage = [
    title && chalk.bold((message || extras) ? title.padEnd(title.length > LOG_TITLE_PAD ? LOG_TITLE_PAD_LONG : LOG_TITLE_PAD) : title),
    extras ? (message || '').padEnd(message && message.length >= LOG_MESSAGE_PAD ? LOG_MESSAGE_PAD_LONG : LOG_MESSAGE_PAD) : message,
    extras && chalk.dim(extras),
  ]
    .filter(item => !!item)
    .join(' ');

  if (dimItAll) resolvedMessage = chalk.dim(resolvedMessage);
  if (level === 'error') resolvedMessage = chalk.bgRed.whiteBright(resolvedMessage);

  // eslint-disable-next-line no-console
  console[level](resolvedMessage);
};

/** @type {import('../index.js').VerboseLog} */
export const verboseLog = (title, message, extras, dimItAll) => log('log', title, message, extras, dimItAll);
