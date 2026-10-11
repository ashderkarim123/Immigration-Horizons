/** Escapes user text so it matches only itself inside a RegExp. */
module.exports = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
