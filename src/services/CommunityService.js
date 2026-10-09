import { getAuthToken } from './AuthTokenStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';

class CommunityService {
  constructor() {
    this.userId = null;
    this.authToken = null;
    void this.loadAuthData();
  }

  async loadAuthData() {
    try {
      this.userId = await AsyncStorage.getItem('risequest_user_id');
      this.authToken = await getAuthToken();
    } catch (error) {
      console.error('CommunityService auth load error:', error);
    }
  }

  async getHeaders() {
    this.authToken = await getAuthToken();
    if (!this.authToken) {
      await this.loadAuthData();
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken || 'anonymous'}`,
    };
  }

  async requestJson(path, { method = 'GET', body } = {}) {
    const baseUrl = await getBackendBaseUrl();
    const headers = await this.getHeaders();
    const resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let json = null;
    try {
      json = await resp.json();
    } catch (_) {
      json = null;
    }

    if (!resp.ok || json?.error) {
      const message = json?.error || `Request failed (${resp.status})`;
      throw new Error(message);
    }

    return json;
  }

  // Settings
  async getSettings() {
    return this.requestJson('/api/community/settings');
  }

  async updateSettings(settings) {
    return this.requestJson('/api/community/settings', {
      method: 'PUT',
      body: settings,
    });
  }

  // Users
  async searchUsers(q) {
    return this.requestJson(`/api/community/users/search?q=${encodeURIComponent(q || '')}`);
  }

  // Buddies
  async listBuddies() {
    return this.requestJson('/api/community/buddies');
  }

  async listBuddyRequests() {
    return this.requestJson('/api/community/buddies/requests');
  }

  async sendBuddyRequest(userIdOrEmail) {
    return this.requestJson('/api/community/buddies/request', {
      method: 'POST',
      body: { userId: userIdOrEmail },
    });
  }

  async respondBuddyRequest(requestId, action) {
    return this.requestJson('/api/community/buddies/respond', {
      method: 'POST',
      body: { requestId, action },
    });
  }

  // Groups
  async listGroups({ topic, q } = {}) {
    const params = new URLSearchParams();
    if (topic) params.set('topic', topic);
    if (q) params.set('q', q);
    const qs = params.toString();
    return this.requestJson(`/api/community/groups${qs ? `?${qs}` : ''}`);
  }

  async createGroup({ name, topic, isPublic = true }) {
    return this.requestJson('/api/community/groups', {
      method: 'POST',
      body: { name, topic, isPublic },
    });
  }

  async joinGroup(groupId) {
    return this.requestJson(`/api/community/groups/${encodeURIComponent(groupId)}/join`, {
      method: 'POST',
    });
  }

  async leaveGroup(groupId) {
    return this.requestJson(`/api/community/groups/${encodeURIComponent(groupId)}/leave`, {
      method: 'POST',
    });
  }

  async getGroupFeed(groupId, { cursor, limit } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.requestJson(`/api/community/groups/${encodeURIComponent(groupId)}/feed${qs ? `?${qs}` : ''}`);
  }

  // Feed / posts
  async getFeed({ scope = 'all', cursor, limit } = {}) {
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.requestJson(`/api/community/feed${qs ? `?${qs}` : ''}`);
  }

  async createPost({ content, visibility, type, groupId } = {}) {
    return this.requestJson('/api/community/posts', {
      method: 'POST',
      body: { content, visibility, type, groupId },
    });
  }

  async deletePost(postId) {
    return this.requestJson(`/api/community/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    });
  }

  async listComments(postId) {
    return this.requestJson(`/api/community/posts/${encodeURIComponent(postId)}/comments`);
  }

  async addComment(postId, content) {
    return this.requestJson(`/api/community/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: { content },
    });
  }

  async react(postId, emoji) {
    return this.requestJson(`/api/community/posts/${encodeURIComponent(postId)}/react`, {
      method: 'POST',
      body: { emoji },
    });
  }

  async unreact(postId, emoji) {
    return this.requestJson(`/api/community/posts/${encodeURIComponent(postId)}/unreact`, {
      method: 'POST',
      body: { emoji },
    });
  }

  // Safety
  async listBlocks() {
    return this.requestJson('/api/community/blocks');
  }

  async blockUser(userIdOrEmail) {
    return this.requestJson('/api/community/block', {
      method: 'POST',
      body: { userId: userIdOrEmail },
    });
  }

  async unblockUser(userIdOrEmail) {
    return this.requestJson('/api/community/unblock', {
      method: 'POST',
      body: { userId: userIdOrEmail },
    });
  }

  async report({ targetType, targetId, reason, details } = {}) {
    return this.requestJson('/api/community/report', {
      method: 'POST',
      body: { targetType, targetId, reason, details },
    });
  }

  // Messaging
  async startDirectThread(userIdOrEmail) {
    return this.requestJson('/api/community/threads/direct', {
      method: 'POST',
      body: { userId: userIdOrEmail },
    });
  }

  async listThreads() {
    return this.requestJson('/api/community/threads');
  }

  async listMessages(threadId, { cursor, limit } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.requestJson(`/api/community/threads/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ''}`);
  }

  async sendMessage(threadId, content) {
    return this.requestJson(`/api/community/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: { content },
    });
  }
}

export const communityService = new CommunityService();
