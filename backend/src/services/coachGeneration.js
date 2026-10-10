const { generateText } = require('./textGeneration');
const { SAFETY_PROMPT } = require('./coachingContext');
const styles = {
  motivational: 'Energetic, uplifting, practical.', gentle: 'Calm, compassionate, low-pressure.',
  scientific: 'Data-driven, evidence-seeking, no fake claims.', friendly: 'Casual, warm, supportive.',
  professional: 'Direct, structured, coach-like.', strict: 'Firm, disciplined, but not insulting.',
  rude: 'Sarcastic/edgy but not hateful or harassing; keep it playful.', fun: 'Playful, humorous, upbeat, friendly.',
};
function generateCoachReply({ coaching, history, personality, request = fetch }) {
  return generateText({ coaching, request, safetyInput: JSON.stringify(history), temperature: 0.7,
    messages: [{ role: 'system', content: "You are RiseQuest's AI Coach for sleep and morning routines. " +
      SAFETY_PROMPT + `Saved preferences and recorded activity: ${JSON.stringify(coaching.context)}. ` +
      `Personality style: ${styles[personality] || styles.gentle}` }, ...history],
    validate: value => value.length <= 6000 ? value : null,
  });
}
module.exports = { generateCoachReply };
