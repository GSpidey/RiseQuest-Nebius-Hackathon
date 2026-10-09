/* eslint-disable */
// GraphQL Mutations for Quest System

export const createQuest = /* GraphQL */ `
  mutation CreateQuest($input: CreateQuestInput!) {
    createQuest(input: $input) {
      id
      userId
      title
      description
      difficulty
      category
      status
      progress
      totalSteps
      currentStep
      subtasks {
        id
        title
        description
        order
        completed
        completedAt
        estimatedMinutes
        difficulty
      }
      estimatedTotalMinutes
      tags
      reminderEnabled
      reminderTime
      createdAt
      updatedAt
      completedAt
    }
  }
`;

export const updateQuest = /* GraphQL */ `
  mutation UpdateQuest($input: UpdateQuestInput!) {
    updateQuest(input: $input) {
      id
      userId
      title
      description
      difficulty
      category
      status
      progress
      totalSteps
      currentStep
      subtasks {
        id
        title
        description
        order
        completed
        completedAt
        estimatedMinutes
        difficulty
      }
      estimatedTotalMinutes
      tags
      reminderEnabled
      reminderTime
      createdAt
      updatedAt
      completedAt
    }
  }
`;

export const deleteQuest = /* GraphQL */ `
  mutation DeleteQuest($input: DeleteQuestInput!) {
    deleteQuest(input: $input) {
      id
      title
      status
    }
  }
`;

export const updateQuestProgress = /* GraphQL */ `
  mutation UpdateQuestProgress($questId: ID!, $subtaskId: String!, $completed: Boolean!) {
    updateQuest(input: {
      id: $questId
      subtasks: {
        id: $subtaskId
        completed: $completed
        completedAt: $completed ? "${new Date().toISOString()}" : null
      }
    }) {
      id
      progress
      currentStep
      subtasks {
        id
        title
        completed
        completedAt
        order
      }
      updatedAt
    }
  }
`;

export const completeQuestStep = /* GraphQL */ `
  mutation CompleteQuestStep($questId: ID!, $subtaskId: String!) {
    updateQuest(input: {
      id: $questId
      subtasks: {
        id: $subtaskId
        completed: true
        completedAt: "${new Date().toISOString()}"
      }
    }) {
      id
      progress
      currentStep
      status
      subtasks {
        id
        title
        completed
        completedAt
        order
      }
      completedAt
      updatedAt
    }
  }
`;

export const updateQuestReminder = /* GraphQL */ `
  mutation UpdateQuestReminder($questId: ID!, $reminderEnabled: Boolean!, $reminderTime: String) {
    updateQuest(input: {
      id: $questId
      reminderEnabled: $reminderEnabled
      reminderTime: $reminderTime
    }) {
      id
      reminderEnabled
      reminderTime
      updatedAt
    }
  }
`;

export const addQuestTags = /* GraphQL */ `
  mutation AddQuestTags($questId: ID!, $tags: [String!]!) {
    updateQuest(input: {
      id: $questId
      tags: $tags
    }) {
      id
      tags
      updatedAt
    }
  }
`;

export const reorderQuestSubtasks = /* GraphQL */ `
  mutation ReorderQuestSubtasks($questId: ID!, $subtasks: [SubtaskInput!]!) {
    updateQuest(input: {
      id: $questId
      subtasks: $subtasks
    }) {
      id
      subtasks {
        id
        title
        order
        completed
      }
      updatedAt
    }
  }
`;