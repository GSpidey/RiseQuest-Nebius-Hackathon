/* eslint-disable */
// GraphQL Mutations for RiseQuest Mobile App - Unified Backend Integration

export const createWallet = /* GraphQL */ `
  mutation CreateWallet($input: CreateWalletInput!) {
    createWallet(input: $input) {
      id
      userId
      balance
      currency
      stripeCustomerId
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const updateWallet = /* GraphQL */ `
  mutation UpdateWallet($input: UpdateWalletInput!) {
    updateWallet(input: $input) {
      id
      userId
      balance
      currency
      stripeCustomerId
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const deleteWallet = /* GraphQL */ `
  mutation DeleteWallet($input: DeleteWalletInput!) {
    deleteWallet(input: $input) {
      id
      userId
      balance
      currency
      stripeCustomerId
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const createTransaction = /* GraphQL */ `
  mutation CreateTransaction($input: CreateTransactionInput!) {
    createTransaction(input: $input) {
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

export const updateTransaction = /* GraphQL */ `
  mutation UpdateTransaction($input: UpdateTransactionInput!) {
    updateTransaction(input: $input) {
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
  }
`;

export const deleteTransaction = /* GraphQL */ `
  mutation DeleteTransaction($input: DeleteTransactionInput!) {
    deleteTransaction(input: $input) {
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
  }
`;

export const createCreditProduct = /* GraphQL */ `
  mutation CreateCreditProduct($input: CreateCreditProductInput!) {
    createCreditProduct(input: $input) {
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

export const updateCreditProduct = /* GraphQL */ `
  mutation UpdateCreditProduct($input: UpdateCreditProductInput!) {
    updateCreditProduct(input: $input) {
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

export const deleteCreditProduct = /* GraphQL */ `
  mutation DeleteCreditProduct($input: DeleteCreditProductInput!) {
    deleteCreditProduct(input: $input) {
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

export const createUserCredits = /* GraphQL */ `
  mutation CreateUserCredits($input: CreateUserCreditsInput!) {
    createUserCredits(input: $input) {
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

export const updateUserCredits = /* GraphQL */ `
  mutation UpdateUserCredits($input: UpdateUserCreditsInput!) {
    updateUserCredits(input: $input) {
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

export const deleteUserCredits = /* GraphQL */ `
  mutation DeleteUserCredits($input: DeleteUserCreditsInput!) {
    deleteUserCredits(input: $input) {
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

// RiseQuest-specific mutations for Rise Points management

export const awardRisePoints = /* GraphQL */ `
  mutation AwardRisePoints($userId: String!, $amount: Int!, $reason: String!, $metadata: AWSJSON) {
    createUserCredits(input: {
      userId: $userId
      appId: "risequest"
      creditType: "rise_points"
      balance: $amount
      totalEarned: $amount
      totalSpent: 0
    }) {
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
    
    createTransaction(input: {
      walletId: $userId
      amount: $amount
      currency: "RISE_POINTS"
      type: EARNING
      status: COMPLETED
      description: $reason
      metadata: $metadata
    }) {
      id
      amount
      description
      createdAt
    }
  }
`;

export const spendRisePoints = /* GraphQL */ `
  mutation SpendRisePoints($userCreditsId: ID!, $amount: Int!, $currentBalance: Int!, $totalSpent: Int!, $description: String!, $metadata: AWSJSON) {
    updateUserCredits(input: {
      id: $userCreditsId
      balance: $currentBalance
      totalSpent: $totalSpent
    }) {
      id
      userId
      appId
      creditType
      balance
      totalEarned
      totalSpent
      updatedAt
    }
    
    createTransaction(input: {
      walletId: $userCreditsId
      amount: $amount
      currency: "RISE_POINTS"
      type: PAYMENT
      status: COMPLETED
      description: $description
      metadata: $metadata
    }) {
      id
      amount
      description
      createdAt
    }
  }
`;

export const createRiseQuestWallet = /* GraphQL */ `
  mutation CreateRiseQuestWallet($userId: String!) {
    createWallet(input: {
      userId: $userId
      balance: 0
      currency: "RISE_POINTS"
      isActive: true
    }) {
      id
      userId
      balance
      currency
      isActive
      createdAt
      updatedAt
    }
    
    createUserCredits(input: {
      userId: $userId
      appId: "risequest"
      creditType: "rise_points"
      balance: 100
      totalEarned: 100
      totalSpent: 0
    }) {
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

// Update user credits balance (generic)
export const updateRisePointsBalance = /* GraphQL */ `
  mutation UpdateRisePointsBalance($id: ID!, $newBalance: Int!, $totalEarned: Int!, $totalSpent: Int!) {
    updateUserCredits(input: {
      id: $id
      balance: $newBalance
      totalEarned: $totalEarned
      totalSpent: $totalSpent
    }) {
      id
      userId
      appId
      creditType
      balance
      totalEarned
      totalSpent
      updatedAt
    }
  }
`;
