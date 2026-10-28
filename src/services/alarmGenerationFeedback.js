// Customer copy is allowlisted here. Upstream text, provider account problems
// and native diagnostics must not become customer-facing error messages.
const GENERATION_FAILED = 'Generation failed. Try again later.';
function generationFailure(status, data = {}) {
  let message = GENERATION_FAILED;
  if (status === 401) message = 'Please sign in and try again.';
  else if (status === 403) message = 'This feature is unavailable for this profile.';
  else if (status === 400 && Number.isFinite(data.balance) && Number.isFinite(data.cost) && data.cost > data.balance)
    message = 'You need more RisePoints to generate this message.';
  return Object.assign(new Error(message), { customerMessage: message });
}
function customerGenerationMessage(error) {
  const allowed = [GENERATION_FAILED, 'Please sign in and try again.',
    'This feature is unavailable for this profile.', 'You need more RisePoints to generate this message.'];
  return allowed.includes(error?.customerMessage) ? error.customerMessage : GENERATION_FAILED;
}
module.exports = { GENERATION_FAILED, generationFailure, customerGenerationMessage };
