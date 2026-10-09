const DEFAULT_TEMPLATES = {
  workout: [
    'Research workout routines',
    'Choose equipment needed',
    'Set up workout space',
    'Create weekly schedule',
    'Track first week progress',
  ],
  learning: [
    'Define learning objectives',
    'Gather learning resources',
    'Create study schedule',
    'Start first lesson/chapter',
    'Practice and review',
    'Take assessment/quiz',
  ],
  project: [
    'Define project scope',
    'Break down requirements',
    'Plan timeline and milestones',
    'Set up project structure',
    'Begin implementation',
    'Test and iterate',
    'Complete and review',
  ],
};

function fallbackSubtasks(title, description, difficulty = 'medium') {
  const text = `${title} ${description}`.toLowerCase();
  let subtasks = null;
  if (text.includes('workout') || text.includes('fitness') || text.includes('exercise')) subtasks = DEFAULT_TEMPLATES.workout;
  if (text.includes('learn') || text.includes('study') || text.includes('course')) subtasks = DEFAULT_TEMPLATES.learning;
  if (text.includes('project') || text.includes('build') || text.includes('create')) subtasks = DEFAULT_TEMPLATES.project;
  if (!subtasks) {
    subtasks = [
      'Plan and research approach',
      'Gather necessary resources',
      'Begin initial work',
      'Review progress and adjust',
      'Complete and finalize',
    ];
  }

  if (difficulty === 'hard') {
    subtasks = [subtasks[0], 'Create detailed action plan', ...subtasks.slice(1).map(s => `${s} (detailed planning required)` )];
  }

  return subtasks;
}

async function generateSubtasks({ title, description, difficulty = 'medium', category = 'general', coaching }) {
  const providers = require('./questProviders').questProviders(coaching);

  if (!process.env.OPENAI_API_KEY || !coaching?.externalAllowed) {
    return { source: coaching?.externalAllowed ? 'offline' : 'curated', subtasks: fallbackSubtasks(title, description, difficulty).map((t, i) => ({
      title: t,
      description: `Step ${i + 1} of your quest`,
      order: i,
      estimatedMinutes: Math.round(30 * (difficulty === 'hard' ? 2 : difficulty === 'easy' ? 0.5 : 1)),
      difficulty,
    })) };
  }

  const prompt = {
    title,
    description,
    difficulty,
    category,
    preferences: coaching.context,
    instructions: 'Return ONLY JSON: an array of 5-10 concise step objects with keys: title, description, estimatedMinutes (integer), difficulty (easy|medium|hard).',
  };

  for (const { name, apiKey, model, baseUrl, parameters } of providers) {
  try {
    const { checkAiSafety } = require('./aiSafety');
    const inputSafety = await checkAiSafety(JSON.stringify(prompt), coaching);
    if (!inputSafety.allowed) return { source: 'curated', subtasks: [
      { title: 'Choose a safe, manageable routine', description: inputSafety.reply, order: 0, estimatedMinutes: 5, difficulty: 'easy' },
    ] };
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...parameters,
        messages: [
          { role: 'system', content: require('./coachingContext').SAFETY_PROMPT + 'You are a task breakdown assistant for a productivity app.' },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
      }),
    });

    if (!resp.ok) {
      throw new Error(`AI provider unavailable (${resp.status})`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');
    const outputSafety = await checkAiSafety(content, coaching);
    if (!outputSafety.allowed) throw new Error('Generated steps were not suitable.');

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('OpenAI returned invalid JSON array');

    if (parsed.some(item => !item || typeof item.title !== 'string' || !item.title.trim())) throw new Error('Incomplete AI steps');
    return { source: 'ai', provider: name, model, subtasks: parsed.slice(0, 12).map((item, i) => ({
      title: item.title.slice(0, 300),
      description: String(item.description || '').slice(0, 1500),
      order: i,
      estimatedMinutes: Number.isFinite(item.estimatedMinutes) ? Math.max(5, Math.min(240, Math.round(item.estimatedMinutes))) : 30,
      difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : difficulty,
    })) };
  } catch (e) {
    // Try the next configured generation provider. Never log prompts or keys.
  }
  }
    const fallback = fallbackSubtasks(title, description, difficulty).map((t, i) => ({
      title: t,
      description: `Step ${i + 1} of your quest`,
      order: i,
      estimatedMinutes: Math.round(30 * (difficulty === 'hard' ? 2 : difficulty === 'easy' ? 0.5 : 1)),
      difficulty,
    }));
    return { source: 'offline', subtasks: fallback };
}

module.exports = {
  generateSubtasks,
};
