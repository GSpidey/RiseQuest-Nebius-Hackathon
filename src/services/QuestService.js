import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { createQuestRepository } from './questRepository';

const repository = createQuestRepository({
  storage: AsyncStorage,
  identity: async () => ({ owner: await AsyncStorage.getItem('risequest_user_id'), token: await getAuthToken() }),
  request: async (session, method, path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${await getBackendBaseUrl()}${path}`, {
        method, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw Object.assign(new Error(result?.error || 'Your change was not saved. Please try again when connected.'), { status: response.status });
      if (result == null && method !== 'DELETE') throw Object.assign(new Error('The response was incomplete. Please refresh before trying again.'), { status: 502 });
      return result;
    } finally { clearTimeout(timer); }
  },
  makeSteps: async (_title, _description, difficulty = 'medium') => [
    'Choose one small first action', 'Gather what you need', 'Try the first action at a comfortable pace',
    'Take a break and review what helped', 'Choose your next step or mark your task complete',
  ].map((title, order) => ({ id: `local_step_${order}`, title, description: 'Prepared offline suggestion — adjust this to your task.',
    order, completed: false, estimatedMinutes: 5, difficulty })),
});

export default {
  createQuest: repository.create,
  getQuest: repository.get,
  getUserQuests: repository.list,
  updateQuestProgress: repository.update,
  deleteQuest: repository.remove,
  getNextStep: quest => !quest || quest.status === 'completed' ? null : quest.subtasks.find(step => !step.completed) || null,
  async getQuestStats(userId) {
    const quests = await repository.list(userId);
    const completed = quests.filter(q => q.status === 'completed').length;
    const totalSteps = quests.reduce((sum, q) => sum + q.subtasks.length, 0);
    const completedSteps = quests.reduce((sum, q) => sum + q.subtasks.filter(s => s.completed).length, 0);
    return { totalQuests: quests.length, completedQuests: completed, activeQuests: quests.filter(q => q.status === 'active').length,
      completionRate: quests.length ? Math.round(completed / quests.length * 100) : 0, totalSteps, completedSteps,
      stepCompletionRate: totalSteps ? Math.round(completedSteps / totalSteps * 100) : 0,
      offline: quests.some(q => q.offline), localDrafts: quests.filter(q => q.syncStatus === 'local-only').length };
  },
};
