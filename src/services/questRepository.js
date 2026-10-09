const keyFor = owner => `risequest_quests:${encodeURIComponent(owner)}`;
const isDraft = quest => quest?.syncStatus === 'local-only' || String(quest?.id).startsWith('local_quest_');

// Dependencies are injected so account switches and offline paths can be tested
// without a device. Never treat an HTTP rejection as a successful local mutation.
function createQuestRepository({ storage, identity, request, makeSteps, now = Date.now }) {
  async function session(expectedOwner) {
    const current = await identity();
    if (!current?.owner || !current.token || (expectedOwner && current.owner !== expectedOwner)) {
      throw new Error('Please sign in to the account that owns this quest.');
    }
    return current;
  }
  async function check(current) {
    const active = await identity();
    if (active?.owner !== current.owner || active?.token !== current.token) throw new Error('Your account changed. Please try again.');
  }
  async function cached(current) {
    await check(current);
    let entries = [];
    const stored = await storage.getItem(keyFor(current.owner));
    try { entries = JSON.parse(stored) || []; } catch (_) {}
    if (!Array.isArray(entries)) entries = [];
    // The old shared cache has explicit owners. Copy only matching records, and
    // keep the original intact until its other owners can migrate their records.
    if (stored == null) {
      let legacy;
      try { legacy = JSON.parse(await storage.getItem('risequest_quests')); } catch (_) {}
      if (Array.isArray(legacy)) entries = legacy.filter(q => q.userId === current.owner);
    }
    await check(current);
    return entries.filter(q => q.userId === current.owner).map(q => isDraft(q) ? { ...q, syncStatus: 'local-only', breakdownSource: q.breakdownSource || 'offline' } : q);
  }
  async function save(current, entries) {
    await check(current);
    if (entries.some(q => q.userId !== current.owner)) throw new Error('Quest ownership did not match this account.');
    await storage.setItem(keyFor(current.owner), JSON.stringify(entries));
  }
  async function put(current, quest) {
    const entries = await cached(current);
    await save(current, [...entries.filter(q => q.id !== quest.id), quest]);
    return quest;
  }
  async function list(owner) {
    const current = await session(owner);
    let result;
    try { result = await request(current, 'GET', `/api/users/${encodeURIComponent(current.owner)}/quests`); }
    catch (error) {
      await check(current);
      if (error.status && error.status < 500) throw error;
      return (await cached(current)).map(q => ({ ...q, offline: true }));
    }
    if (!Array.isArray(result)) throw new Error('The quest response was incomplete. Please retry.');
    const drafts = (await cached(current)).filter(isDraft);
    const merged = [...result, ...drafts.filter(q => !result.some(r => r.id === q.id))];
    await save(current, merged);
    return merged;
  }
  async function create(data) {
    const current = await session(data.userId);
    let quest;
    try { quest = await request(current, 'POST', '/api/quests', data); }
    catch (error) {
      await check(current);
      // Only a transport outage creates a clearly labelled local draft. Server
      // validation, throttling and authorization errors stay visible to the user.
      if (error.status) throw error;
      const subtasks = await makeSteps(data.title, data.description, data.difficulty || 'medium');
      quest = { ...data, id: `local_quest_${now()}_${Math.random().toString(36).slice(2)}`, userId: current.owner,
        syncStatus: 'local-only', breakdownSource: 'offline', status: 'active', progress: 0, currentStep: 0,
        totalSteps: subtasks.length, subtasks, estimatedTotalMinutes: subtasks.reduce((sum, step) => sum + step.estimatedMinutes, 0),
        createdAt: new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString(), completedAt: null };
    }
    return put(current, quest);
  }
  async function get(id) {
    const current = await session();
    const local = (await cached(current)).find(q => q.id === id);
    if (isDraft(local)) return local;
    let quest;
    try { quest = await request(current, 'GET', `/api/quests/${encodeURIComponent(id)}`); }
    catch (error) {
      await check(current);
      if (error.status && error.status < 500) throw error;
      if (local) return { ...local, offline: true };
      throw error;
    }
    return put(current, quest);
  }
  async function update(id, subtaskId, completed) {
    const current = await session();
    const local = (await cached(current)).find(q => q.id === id);
    if (!isDraft(local)) {
      const result = await request(current, 'PATCH', `/api/quests/${encodeURIComponent(id)}/subtasks/${encodeURIComponent(subtaskId)}`, { completed });
      return put(current, result);
    }
    if (!local.subtasks.some(s => s.id === subtaskId)) throw new Error('Quest step not found.');
    const date = new Date(now()).toISOString();
    const subtasks = local.subtasks.map(s => s.id === subtaskId ? { ...s, completed, completedAt: completed ? date : null } : s);
    const count = subtasks.filter(s => s.completed).length;
    return put(current, { ...local, subtasks, currentStep: count, progress: Math.round(count / subtasks.length * 100),
      status: count === subtasks.length ? 'completed' : 'active', completedAt: count === subtasks.length ? date : null, updatedAt: date });
  }
  async function remove(id) {
    const current = await session();
    const entries = await cached(current);
    if (!isDraft(entries.find(q => q.id === id))) await request(current, 'DELETE', `/api/quests/${encodeURIComponent(id)}`);
    await save(current, entries.filter(q => q.id !== id));
    return true;
  }
  return { list, create, get, update, remove };
}
module.exports = { createQuestRepository, questCacheKey: keyFor, isLocalQuest: isDraft };
