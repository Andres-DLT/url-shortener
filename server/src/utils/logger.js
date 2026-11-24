const ts = () => new Date().toISOString();
const silent = process.env.NODE_ENV === 'test';

export const logger = {
  info: (...args) => !silent && console.log(ts(), 'INFO ', ...args),
  warn: (...args) => !silent && console.warn(ts(), 'WARN ', ...args),
  error: (...args) => console.error(ts(), 'ERROR', ...args),
};
