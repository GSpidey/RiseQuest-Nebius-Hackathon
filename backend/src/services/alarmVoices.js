// Curated, stock (PREDEFINED) Async voices verified against /voices, 2026-10-11.
// No user-created or cloned voices are accepted by the alarm endpoint.
const voices = [
  ['f493c663-b272-493e-8b78-72d2262a2a8d', 'Stella', 'Warm and conversational'],
  ['84905ece-2420-47b5-b3d6-964e62200c73', 'Cleo', 'Gentle and comforting'],
  ['a44e2f09-6897-4e1e-8573-631207c53f6d', 'Fisher', 'Calm and warm'],
  ['317bf805-4b42-417b-9474-10807e2f67c9', 'Max', 'Smooth and reassuring'],
  ['054c9aed-4786-4fa5-a317-09abd199e21f', 'Lucina', 'Calm British voice'],
  ['c01e9ac9-dc1b-4263-9b70-091f919c05f4', 'Rupert', 'Measured British voice'],
  ['a6268eaf-976d-4d44-871d-57e1d58002c7', 'Elara', 'Bright and friendly'],
  ['5d20dd0a-a781-43ea-b06c-56892a691715', 'Winslet', 'Gently encouraging'],
  ['3950360d-4810-4c65-a0b8-eb5b4b3b4231', 'Hayes', 'Clear and steady'],
  ['8f7ad606-26df-400a-8336-e7162a977be7', 'Corin', 'Warm and confident'],
  ['ef932845-cfe9-4748-a123-454664076938', 'Acadia', 'Energetic and reassuring'],
  ['e5a67eaf-6e5a-4488-9fb9-4806bd7fea54', 'Elio', 'Bright and energetic'],
].map(([id, name, description]) => ({ id, name, description }));
module.exports = { voices };
