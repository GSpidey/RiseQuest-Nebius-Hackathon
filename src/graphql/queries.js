/* eslint-disable */
// GraphQL Queries for RiseQuest Mobile App - Unified Backend Integration

export const getWallet = /* GraphQL */ `
  query GetWallet($id: ID!) {
    getWallet(id: $id) {
      id
      userId
      balance
      currency
      stripeCustomerId
      isActive
      transactions {
        items {
          id
          amount
          currency
          type
          status
          description
          metadata
          createdAt
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const listWallets = /* GraphQL */ `
  query ListWallets($filter: ModelWalletFilterInput, $limit: Int, $nextToken: String) {
    listWallets(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        userId
        balance
        currency
        stripeCustomerId
        isActive
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getTransaction = /* GraphQL */ `
  query GetTransaction($id: ID!) {
    getTransaction(id: $id) {
      id
      walletId
      amount
      currency
      type
      status
      stripePaymentId
      description
      metadata
      wallet {
        id
        userId
        balance
        currency
      }
      createdAt
      updatedAt
    }
  }
`;

export const listTransactions = /* GraphQL */ `
  query ListTransactions($filter: ModelTransactionFilterInput, $limit: Int, $nextToken: String) {
    listTransactions(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        walletId
        amount
        currency
        type
        status
        stripePaymentId
        description
        metadata
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getCreditProduct = /* GraphQL */ `
  query GetCreditProduct($id: ID!) {
    getCreditProduct(id: $id) {
      id
      name
      description
      creditAmount
      priceInCents
      currency
      stripePriceId
      isActive
      sortOrder
      createdAt
      updatedAt
    }
  }
`;

export const listCreditProducts = /* GraphQL */ `
  query ListCreditProducts($filter: ModelCreditProductFilterInput, $limit: Int, $nextToken: String) {
    listCreditProducts(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        description
        creditAmount
        priceInCents
        currency
        stripePriceId
        isActive
        sortOrder
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getUserCredits = /* GraphQL */ `
  query GetUserCredits($id: ID!) {
    getUserCredits(id: $id) {
      id
      userId
      appId
      creditType
      balance
      totalEarned
      totalSpent
      createdAt
      updatedAt
    }
  }
`;

export const listUserCredits = /* GraphQL */ `
  query ListUserCredits($filter: ModelUserCreditsFilterInput, $limit: Int, $nextToken: String) {
    listUserCredits(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        userId
        appId
        creditType
        balance
        totalEarned
        totalSpent
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// RiseQuest-specific queries for Rise Points (UserCredits with appId: 'risequest')
export const getRiseQuestUserCredits = /* GraphQL */ `
  query GetRiseQuestUserCredits($userId: String!) {
    listUserCredits(filter: {
      userId: { eq: $userId }
      appId: { eq: "risequest" }
    }) {
      items {
        id
        userId
        appId
        creditType
        balance
        totalEarned
        totalSpent
        createdAt
        updatedAt
      }
    }
  }
`;

export const getRisePointsBalance = /* GraphQL */ `
  query GetRisePointsBalance($userId: String!) {
    listUserCredits(filter: {
      userId: { eq: $userId }
      appId: { eq: "risequest" }
      creditType: { eq: "rise_points" }
    }) {
      items {
        id
        balance
        totalEarned
        totalSpent
        updatedAt
      }
    }
  }
`;

export const getTransactionsByWallet = /* GraphQL */ `
  query GetTransactionsByWallet($walletId: ID!, $limit: Int, $nextToken: String) {
    listTransactions(
      filter: { walletId: { eq: $walletId } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        walletId
        amount
        currency
        type
        status
        description
        metadata
        createdAt
      }
      nextToken
    }
  }
`;
