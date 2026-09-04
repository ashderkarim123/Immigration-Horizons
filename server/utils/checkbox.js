function isChecked(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((entry) => entry === 'on' || entry === 'true');
}

module.exports = { isChecked };
