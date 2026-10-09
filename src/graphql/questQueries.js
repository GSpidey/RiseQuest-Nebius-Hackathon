/* eslint-disable */
// GraphQL Queries for Quest System

export const getQuest = /* GraphQL */ `
  query GetQuest($id: ID!) {
    getQuest(id: $id) {
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

export const listUserQuests = /* GraphQL */ `
  query ListUserQuests($userId: String!, $status: String, $limit: Int, $nextToken: String) {
    listQuests(
      filter: { 
        userId: { eq: $userId }
        status: { eq: $status }
      }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
      nextToken
    }
  }
`;

export const listActiveQuests = /* GraphQL */ `
  query ListActiveQuests($userId: String!, $limit: Int) {
    listQuests(
      filter: { 
        userId: { eq: $userId }
        status: { eq: "active" }
      }
      limit: $limit
    ) {
      items {
        id
        title
        description
        difficulty
        progress
        totalSteps
        currentStep
        subtasks {
          id
          title
          completed
          order
          estimatedMinutes
        }
        estimatedTotalMinutes
        createdAt
        updatedAt
      }
    }
  }
`;

export const getQuestProgress = /* GraphQL */ `
  query GetQuestProgress($userId: String!) {
    listQuests(
      filter: { userId: { eq: $userId } }
    ) {
      items {
        id
        title
        status
        progress
        totalSteps
        currentStep
        completedAt
      }
    }
  }
`;

export const searchQuests = /* GraphQL */ `
  query SearchQuests($userId: String!, $searchTerm: String!, $category: String, $limit: Int) {
    listQuests(
      filter: { 
        userId: { eq: $userId }
        title: { contains: $searchTerm }
        category: { eq: $category }
      }
      limit: $limit
    ) {
      items {
        id
        title
        description
        difficulty
        category
        status
        progress
        totalSteps
        currentStep
        tags
        createdAt
        updatedAt
      }
    }
  }
`;