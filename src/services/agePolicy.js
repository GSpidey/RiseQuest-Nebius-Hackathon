const AGE_BANDS = Object.freeze([
  { id: 'under13', label: 'Under 13', group: 'child' },
  { id: '13to15', label: '13–15', group: 'teen' },
  { id: '16to17', label: '16–17', group: 'teen' },
  { id: 'adult', label: '18 or older', group: 'adult' },
]);
function groupForBand(band) { return AGE_BANDS.find(value => value.id === band)?.group || null; }
module.exports = { AGE_BANDS, groupForBand };
