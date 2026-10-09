import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MonetizationService } from '../utils/MonetizationService';

const { width, height } = Dimensions.get('window');

/**
 * Comprehensive Mini-Game Challenge System
 * Multiple game types with adaptive difficulty
 */
export const MiniGameChallengeSystem = ({ 
  onGameComplete,
  onGameFail,
  gameType,
  difficulty = 'normal',
  userProfile,
  alarmImportance,
  onClose,
}) => {
  const [currentGame, setCurrentGame] = useState(null);
  const [gameData, setGameData] = useState({});
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const [showGameSelector, setShowGameSelector] = useState(true);
  const [accessBusy, setAccessBusy] = useState(false);

  const gameTypes = [
    {
      id: 'math',
      name: 'Math Challenge',
      icon: '🔢',
      description: 'Solve arithmetic problems',
      supportFriendly: true,
    },
    {
      id: 'memory',
      name: 'Memory Pattern',
      icon: '🧠',
      description: 'Remember and repeat sequences',
      supportFriendly: true,
    },
    {
      id: 'puzzle',
      name: 'Sliding Puzzle',
      icon: '🧩',
      description: 'Arrange pieces in order',
      supportFriendly: false,
    },
    {
      id: 'typing',
      name: 'Type Challenge',
      icon: '⌨️',
      description: 'Type the given text quickly',
      supportFriendly: true,
    },
    {
      id: 'physical',
      name: 'Movement Task',
      icon: '🏃',
      description: 'Physical activity to wake up',
      supportFriendly: false,
    },
    {
      id: 'logic',
      name: 'Logic Puzzle',
      icon: '🤔',
      description: 'Solve logical problems',
      supportFriendly: true,
    },
  ];

  const difficultyLevels = {
    easy: { name: 'Easy', timeMultiplier: 1.5, attemptsAllowed: 5, color: '#4CAF50' },
    normal: { name: 'Normal', timeMultiplier: 1.0, attemptsAllowed: 3, color: '#FF9800' },
    hard: { name: 'Hard', timeMultiplier: 0.7, attemptsAllowed: 2, color: '#F44336' },
    extreme: { name: 'Extreme', timeMultiplier: 0.5, attemptsAllowed: 1, color: '#9C27B0' },
    adaptive: { name: 'Adaptive', timeMultiplier: 1.0, attemptsAllowed: 3, color: '#2196F3' },
  };

  useEffect(() => {
    if (currentGame) {
      initializeGame(currentGame);
    }
  }, [currentGame]);

  useEffect(() => {
    if (currentGame && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      handleTimeUp();
    }
  }, [timeLeft, currentGame]);

  const GameSelector = () => {
    const availableGames = gameTypes;

    return (
      <Modal visible={showGameSelector} transparent={false}>
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.selectorContainer}>
          <View style={styles.selectorHeader}>
            {typeof onClose === 'function' && (
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.selectorTitle}>🎮 Choose Your Challenge</Text>
            <Text style={styles.selectorSubtitle}>
              Complete the challenge to stop snoozing
            </Text>
          </View>

          <ScrollView style={styles.gameList}>
            {availableGames.map(game => (
              <TouchableOpacity
                key={game.id}
                style={styles.gameOption}
                onPress={() => selectGame(game.id)}
                disabled={accessBusy}
              >
                <Text style={styles.gameIcon}>{game.icon}</Text>
                <View style={styles.gameInfo}>
                  <Text style={styles.gameName}>{game.name}</Text>
                  <Text style={styles.gameDescription}>{game.description}</Text>
                  {userProfile?.supportEnabled && game.supportFriendly && (
                    <Text style={styles.supportBadge}>💙 ADHD/Bipolar Friendly</Text>
                  )}
                </View>
                <Text style={styles.selectArrow}>▶️</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.difficultyInfo}>
            <Text style={styles.difficultyLabel}>
              Difficulty: {difficultyLevels[difficulty]?.name || 'Normal'}
            </Text>
            <Text style={styles.difficultyDescription}>
              {getDifficultyDescription()}
            </Text>
          </View>
        </LinearGradient>
      </Modal>
    );
  };

  const MathChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>🔢 Math Challenge</Text>
      <Text style={styles.problemText}>{gameData.problem}</Text>
      
      <View style={styles.answerGrid}>
        {gameData.options?.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={styles.answerButton}
            onPress={() => checkMathAnswer(option)}
          >
            <Text style={styles.answerText}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.progressText}>
        Problem {gameData.currentProblem || 1} of {gameData.totalProblems || 3}
      </Text>
    </View>
  );

  const MemoryChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>🧠 Memory Pattern</Text>
      
      {gameData.showingPattern ? (
        <View style={styles.memoryGrid}>
          <Text style={styles.memoryInstruction}>Remember this pattern</Text>
          {gameData.pattern?.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.memoryRow}>
              {row.map((cell, cellIndex) => (
                <View
                  key={cellIndex}
                  style={[
                    styles.memoryCell,
                    cell ? styles.memoryCellActive : styles.memoryCellInactive
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.memoryGrid}>
          <Text style={styles.memoryInstruction}>Recreate the pattern</Text>
          {gameData.userPattern?.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.memoryRow}>
              {row.map((cell, cellIndex) => (
                <TouchableOpacity
                  key={cellIndex}
                  style={[
                    styles.memoryCell,
                    cell ? styles.memoryCellActive : styles.memoryCellInactive
                  ]}
                  onPress={() => toggleMemoryCell(rowIndex, cellIndex)}
                />
              ))}
            </View>
          ))}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={checkMemoryPattern}
          >
            <Text style={styles.submitButtonText}>Submit Pattern</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const PuzzleChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>🧩 Sliding Puzzle</Text>
      
      <View style={styles.puzzleGrid}>
        {gameData.tiles?.map((tile, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.puzzleTile,
              tile === 0 && styles.emptyTile
            ]}
            onPress={() => movePuzzleTile(index)}
            disabled={tile === 0}
          >
            {tile !== 0 && (
              <Text style={styles.tileNumber}>{tile}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.movesText}>Moves: {gameData.moves || 0}</Text>
    </View>
  );

  const TypingChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>⌨️ Type Challenge</Text>
      
      <View style={styles.typingContainer}>
        <Text style={styles.typingText}>{gameData.targetText}</Text>
        
        <View style={styles.typingProgress}>
          {gameData.targetText?.split('').map((char, index) => (
            <Text
              key={index}
              style={[
                styles.typingChar,
                index < gameData.typedLength ? styles.typedChar : styles.untypedChar,
                index === gameData.typedLength && styles.currentChar
              ]}
            >
              {char}
            </Text>
          ))}
        </View>

        <View style={styles.keyboard}>
          {getKeyboardRows().map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyboardRow}>
              {row.map(key => (
                <TouchableOpacity
                  key={key}
                  style={styles.keyButton}
                  onPress={() => typeCharacter(key)}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const PhysicalChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>🏃 Movement Challenge</Text>
      
      <View style={styles.physicalContainer}>
        <Text style={styles.physicalInstruction}>
          {gameData.instruction || 'Shake your phone 10 times'}
        </Text>
        
        <View style={styles.progressCircle}>
          <Text style={styles.progressNumber}>
            {gameData.progress || 0}
          </Text>
          <Text style={styles.progressTarget}>
            / {gameData.target || 10}
          </Text>
        </View>

        <Text style={styles.physicalHint}>
          {getPhysicalHint()}
        </Text>
      </View>
    </View>
  );

  const LogicChallenge = () => (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>🤔 Logic Puzzle</Text>
      
      <View style={styles.logicContainer}>
        <Text style={styles.logicQuestion}>{gameData.question}</Text>
        
        <View style={styles.logicOptions}>
          {gameData.options?.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.logicOption}
              onPress={() => checkLogicAnswer(option)}
            >
              <Text style={styles.logicOptionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const selectGame = async (gameId) => {
    if (accessBusy) return;

    // Enforce premium/trial gate for non-basic games (math is always available)
    if (gameId !== 'math') {
      setAccessBusy(true);
      try {
        const hasAccess = await MonetizationService.checkFeatureAccess(
          MonetizationService.PREMIUM_FEATURES.UNLIMITED_MINI_GAMES
        );
        if (!hasAccess) {
          await MonetizationService.triggerUpsell('locked_mini_game', { gameType: gameId });
          return;
        }
      } finally {
        setAccessBusy(false);
      }
    }

    setCurrentGame(gameId);
    setShowGameSelector(false);
    setTimeLeft((60 * (difficultyLevels[difficulty]?.timeMultiplier || 1)) || 60);
  };

  const initializeGame = (gameId) => {
    switch (gameId) {
      case 'math':
        initializeMathGame();
        break;
      case 'memory':
        initializeMemoryGame();
        break;
      case 'puzzle':
        initializePuzzleGame();
        break;
      case 'typing':
        initializeTypingGame();
        break;
      case 'physical':
        initializePhysicalGame();
        break;
      case 'logic':
        initializeLogicGame();
        break;
    }
  };

  const initializeMathGame = () => {
    const diffLevel = difficulty === 'adaptive' ? 'normal' : difficulty;
    const operations = ['easy', 'normal'].includes(diffLevel) ? ['+', '-'] : ['+', '-', '*', '/'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let a, b, answer;
    switch (operation) {
      case '+':
        a = Math.floor(Math.random() * (diffLevel === 'easy' ? 50 : 100)) + 1;
        b = Math.floor(Math.random() * (diffLevel === 'easy' ? 50 : 100)) + 1;
        answer = a + b;
        break;
      case '-':
        a = Math.floor(Math.random() * 100) + 50;
        b = Math.floor(Math.random() * 50) + 1;
        answer = a - b;
        break;
      case '*':
        a = Math.floor(Math.random() * 12) + 1;
        b = Math.floor(Math.random() * 12) + 1;
        answer = a * b;
        break;
      case '/':
        answer = Math.floor(Math.random() * 12) + 1;
        b = Math.floor(Math.random() * 12) + 1;
        a = answer * b;
        break;
    }

    const problem = `${a} ${operation} ${b} = ?`;
    const wrongAnswers = [
      answer + Math.floor(Math.random() * 10) + 1,
      answer - Math.floor(Math.random() * 10) - 1,
      answer + Math.floor(Math.random() * 20) + 5
    ];
    const options = [answer, ...wrongAnswers].sort(() => Math.random() - 0.5);

    setGameData({
      problem,
      answer,
      options,
      currentProblem: 1,
      totalProblems: 3,
      correctAnswers: 0
    });
  };

  const initializeMemoryGame = () => {
    const size = difficulty === 'easy' ? 3 : difficulty === 'normal' ? 4 : 5;
    const pattern = Array(size).fill().map(() => 
      Array(size).fill().map(() => Math.random() > 0.6)
    );
    
    setGameData({
      pattern,
      userPattern: Array(size).fill().map(() => Array(size).fill(false)),
      showingPattern: true,
      size
    });

    // Show pattern for a few seconds
    setTimeout(() => {
      setGameData(prev => ({ ...prev, showingPattern: false }));
    }, (difficulty === 'easy' ? 5 : difficulty === 'normal' ? 4 : 3) * 1000);
  };

  const initializePuzzleGame = () => {
    const size = 3; // 3x3 puzzle
    const solved = Array.from({length: size * size - 1}, (_, i) => i + 1).concat([0]);
    const shuffled = [...solved];
    
    // Shuffle the puzzle
    for (let i = 0; i < 100; i++) {
      const emptyIndex = shuffled.indexOf(0);
      const possibleMoves = getPossibleMoves(emptyIndex, size);
      const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      [shuffled[emptyIndex], shuffled[randomMove]] = [shuffled[randomMove], shuffled[emptyIndex]];
    }

    setGameData({
      tiles: shuffled,
      solved,
      moves: 0,
      size
    });
  };

  const initializeTypingGame = () => {
    const texts = {
      easy: ['good morning', 'wake up time', 'rise and shine'],
      normal: ['time to start the day', 'embrace the morning', 'seize the moment'],
      hard: ['productivity awaits your awakening', 'transform dreams into reality today', 'excellence begins with morning discipline']
    };

    const diffLevel = difficulty === 'adaptive' ? 'normal' : difficulty;
    const textArray = texts[diffLevel] || texts.normal;
    const targetText = textArray[Math.floor(Math.random() * textArray.length)];

    setGameData({
      targetText,
      typedLength: 0,
      userText: ''
    });
  };

  const initializePhysicalGame = () => {
    const challenges = [
      { instruction: 'Shake your phone 10 times', target: 10, type: 'shake' },
      { instruction: 'Take 5 deep breaths', target: 5, type: 'breathing' },
      { instruction: 'Do 3 jumping jacks', target: 3, type: 'exercise' },
    ];

    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    setGameData({
      ...challenge,
      progress: 0
    });
  };

  const initializeLogicGame = () => {
    const questions = [
      {
        question: "If today is Tuesday, what day was it 3 days ago?",
        options: ["Saturday", "Sunday", "Monday", "Friday"],
        answer: "Saturday"
      },
      {
        question: "What comes next: 2, 4, 8, 16, ?",
        options: ["24", "32", "20", "18"],
        answer: "32"
      },
      {
        question: "If all roses are flowers and some flowers are red, then:",
        options: ["All roses are red", "Some roses might be red", "No roses are red", "All flowers are roses"],
        answer: "Some roses might be red"
      }
    ];

    const question = questions[Math.floor(Math.random() * questions.length)];
    setGameData(question);
  };

  const renderCurrentGame = () => {
    switch (currentGame) {
      case 'math':
        return <MathChallenge />;
      case 'memory':
        return <MemoryChallenge />;
      case 'puzzle':
        return <PuzzleChallenge />;
      case 'typing':
        return <TypingChallenge />;
      case 'physical':
        return <PhysicalChallenge />;
      case 'logic':
        return <LogicChallenge />;
      default:
        return null;
    }
  };

  const handleGameSuccess = () => {
    Alert.alert(
      '🎉 Challenge Complete!',
      'Great job! You can now turn off the alarm.',
      [{ text: 'OK', onPress: onGameComplete }]
    );
  };

  const handleGameFailure = () => {
    const maxAttempts = difficultyLevels[difficulty]?.attemptsAllowed || 3;
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    if (newAttempts >= maxAttempts) {
      Alert.alert(
        '❌ Challenge Failed',
        'Maximum attempts reached. The alarm will continue.',
        [{ text: 'Try Again', onPress: onGameFail }]
      );
    } else {
      Alert.alert(
        '😅 Try Again',
        `Attempt ${newAttempts}/${maxAttempts}. Keep going!`,
        [{ text: 'Continue', onPress: () => initializeGame(currentGame) }]
      );
    }
  };

  const handleTimeUp = () => {
    Alert.alert(
      '⏰ Time\'s Up!',
      'You ran out of time. Try again!',
      [{ text: 'Restart', onPress: () => initializeGame(currentGame) }]
    );
  };

  const getDifficultyDescription = () => {
    const level = difficultyLevels[difficulty];
    return `${level?.attemptsAllowed} attempts • ${Math.round(60 * level?.timeMultiplier)}s time limit`;
  };

  const getPhysicalHint = () => {
    switch (gameData.type) {
      case 'shake':
        return 'Hold your phone and shake it up and down';
      case 'breathing':
        return 'Tap the screen as you inhale and exhale';
      case 'exercise':
        return 'Tap when you complete each jumping jack';
      default:
        return 'Follow the instructions above';
    }
  };

  const getKeyboardRows = () => [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ' ']
  ];

  return (
    <View style={styles.container}>
      <GameSelector />
      
      {currentGame && (
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gameScreen}>
          <View style={styles.gameHeader}>
            <Text style={styles.timeLeft}>⏱️ {timeLeft}s</Text>
            <Text style={styles.attempts}>
              Attempt {attempts + 1}/{difficultyLevels[difficulty]?.attemptsAllowed || 3}
            </Text>
          </View>

          {renderCurrentGame()}

          <TouchableOpacity
            style={styles.giveUpButton}
            onPress={() => {
              Alert.alert(
                'Give Up?',
                'The alarm will keep ringing. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Give Up', onPress: onGameFail }
                ]
              );
            }}
          >
            <Text style={styles.giveUpText}>Give Up</Text>
          </TouchableOpacity>
        </LinearGradient>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  // Game Selector Styles
  selectorContainer: {
    flex: 1,
    paddingTop: 50,
  },
  selectorHeader: {
    padding: 20,
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backButtonText: {
    color: 'white',
    fontWeight: '800',
  },
  selectorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  selectorSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  gameList: {
    flex: 1,
    padding: 20,
  },
  gameOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  gameIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  gameDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  supportBadge: {
    fontSize: 12,
    color: '#81C784',
    marginTop: 4,
    fontWeight: '500',
  },
  selectArrow: {
    fontSize: 20,
  },
  difficultyInfo: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  difficultyLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  difficultyDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },

  // Game Screen Styles
  gameScreen: {
    flex: 1,
    paddingTop: 50,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  timeLeft: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF5722',
  },
  attempts: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  gameContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  gameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  giveUpButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    padding: 15,
    borderRadius: 8,
    margin: 20,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  giveUpText: {
    color: '#F44336',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Math Game Styles
  problemText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 30,
    textAlign: 'center',
  },
  answerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  answerButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 10,
    margin: 5,
    minWidth: 80,
  },
  answerText: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  progressText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 10,
  },

  // Memory Game Styles
  memoryGrid: {
    alignItems: 'center',
  },
  memoryInstruction: {
    color: 'white',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  memoryRow: {
    flexDirection: 'row',
  },
  memoryCell: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 4,
  },
  memoryCellActive: {
    backgroundColor: '#4CAF50',
  },
  memoryCellInactive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Puzzle Game Styles
  puzzleGrid: {
    width: width * 0.8,
    height: width * 0.8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  puzzleTile: {
    width: '33.33%',
    height: '33.33%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTile: {
    backgroundColor: 'transparent',
  },
  tileNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  movesText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 20,
  },

  // Typing Game Styles
  typingContainer: {
    width: '100%',
  },
  typingText: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  typingProgress: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 30,
  },
  typingChar: {
    fontSize: 18,
    padding: 2,
  },
  typedChar: {
    color: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  untypedChar: {
    color: 'rgba(255,255,255,0.6)',
  },
  currentChar: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  keyboard: {
    alignItems: 'center',
  },
  keyboardRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  keyButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    margin: 2,
    borderRadius: 6,
    minWidth: 30,
  },
  keyText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Physical Game Styles
  physicalContainer: {
    alignItems: 'center',
  },
  physicalInstruction: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
  },
  progressCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  progressNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
  },
  progressTarget: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.8)',
  },
  physicalHint: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Logic Game Styles
  logicContainer: {
    width: '100%',
  },
  logicQuestion: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  logicOptions: {
    width: '100%',
  },
  logicOption: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  logicOptionText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
  },
});

export default MiniGameChallengeSystem;
