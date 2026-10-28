import Modal, { AppAlert as Alert } from './AppModal';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated } from 'react-native';
import {sunrise} from './SunriseUI';
import { MonetizationService } from '../utils/MonetizationService';
import AdaptiveTraining from '../features/training/AdaptiveTraining';
import {speak,stopSpeech,stopWhenBackgrounded} from '../features/companion/speech';
import { getPossibleMoves, moveTile, samePattern } from '../utils/miniGameRules';

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
  const [alternative,setAlternative] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameData, setGameData] = useState({});
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const [showGameSelector, setShowGameSelector] = useState(true);
  const [accessBusy, setAccessBusy] = useState(false);
  const [roundStatus, setRoundStatus] = useState('idle');
  const [feedback, setFeedback] = useState('');
  const patternTimer = useRef(null);
  const accessLock = useRef(false);
  const mounted = useRef(true);
  const actionLock = useRef(false);

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
    mounted.current = true;
    const stopAudio = stopWhenBackgrounded();
    return () => { mounted.current = false; clearTimeout(patternTimer.current); stopAudio(); };
  }, []);

  useEffect(() => { actionLock.current = false; }, [gameData, roundStatus]);

  useEffect(() => {
    if (currentGame && roundStatus === 'playing' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(value => Math.max(0, value - 1)), 1000);
      return () => clearTimeout(timer);
    } else if (currentGame && roundStatus === 'playing' && timeLeft === 0) {
      handleTimeUp();
    }
  }, [timeLeft, currentGame, roundStatus]);

  const GameSelector = () => {
    const availableGames = gameTypes;

    return (
      <Modal visible={showGameSelector} transparent={false} onRequestClose={onClose}>
        <ScrollView style={styles.container} contentContainerStyle={styles.selectorContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.selectorHeader}>
            {typeof onClose === 'function' && (
              <TouchableOpacity style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.selectorTitle}>🎮 Choose Your Challenge</Text>
            <Text style={styles.selectorSubtitle}>
              Choose a challenge and give your mind a little practice
            </Text>
          </View>

          <View style={styles.gameList}>
            <TouchableOpacity style={styles.gameOption} onPress={()=>{setAlternative('adaptive');setShowGameSelector(false);}} accessibilityRole="button"><Text style={styles.gameIcon}>✨</Text><View style={styles.gameInfo}><Text style={styles.gameName}>Adaptive challenges · Premium</Text><Text style={styles.gameDescription}>Memory grids, numbers, sorting, typing and listening</Text></View></TouchableOpacity>
            <TouchableOpacity style={styles.gameOption} onPress={()=>{setAlternative('affirmation');setShowGameSelector(false);}} accessibilityRole="button"><Text style={styles.gameIcon}>🔊</Text><View style={styles.gameInfo}><Text style={styles.gameName}>Spoken affirmation · free</Text><Text style={styles.gameDescription}>A calm, untimed alternative with no puzzle to solve</Text></View></TouchableOpacity>
            {availableGames.map(game => (
              <TouchableOpacity
                key={game.id}
                style={styles.gameOption}
                onPress={() => selectGame(game.id)}
                disabled={accessBusy}
                accessibilityRole="button"
                accessibilityLabel={game.name}
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
          </View>
          {!!feedback && <Text accessibilityRole="alert" style={styles.memoryInstruction}>{feedback}</Text>}

          <View style={styles.difficultyInfo}>
            <Text style={styles.difficultyLabel}>
              Difficulty: {difficultyLevels[difficulty]?.name || 'Normal'}
            </Text>
            <Text style={styles.difficultyDescription}>
              {getDifficultyDescription()}
            </Text>
          </View>
        </ScrollView>
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
            accessibilityRole="button"
            accessibilityLabel={`Answer ${option}`}
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
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Row ${rowIndex + 1}, column ${cellIndex + 1}`}
                  accessibilityState={{ checked: cell }}
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
            accessibilityRole="button"
            accessibilityLabel={`Tile ${tile}`}
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
        <TouchableOpacity style={styles.submitButton} accessibilityRole="button"
          accessibilityLabel="Count one completed movement" onPress={countMovement}>
          <Text style={styles.submitButtonText}>Count one completed movement</Text>
        </TouchableOpacity>
        <Text style={styles.physicalHint}>Self-reported: tap after each movement. Only move in a way that is safe and comfortable for you.</Text>
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
    if (accessLock.current) return;
    accessLock.current = true;
    setFeedback('');

    // All original games remain free. Adaptive practice has its own subscription gate.
    accessLock.current = false;
    if (!mounted.current) return;
    setCurrentGame(gameId);
    setShowGameSelector(false);
    setAttempts(0);
    initializeGame(gameId);
  };

  const initializeGame = (gameId) => {
    clearTimeout(patternTimer.current);
    setTimeLeft(Math.round(60 * (difficultyLevels[difficulty]?.timeMultiplier || 1)));
    setFeedback('');
    setRoundStatus('playing');
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

  const initializeMathGame = (currentProblem = 1) => {
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
      currentProblem,
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
    patternTimer.current = setTimeout(() => {
      if (mounted.current) setGameData(prev => ({ ...prev, showingPattern: false }));
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
    if (shuffled.every((tile, index) => tile === solved[index])) {
      [shuffled[7], shuffled[8]] = [shuffled[8], shuffled[7]];
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
      { instruction: 'Gently raise and lower one hand 10 times', target: 10, type: 'stretch' },
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
        return MathChallenge();
      case 'memory':
        return MemoryChallenge();
      case 'puzzle':
        return PuzzleChallenge();
      case 'typing':
        return TypingChallenge();
      case 'physical':
        return PhysicalChallenge();
      case 'logic':
        return LogicChallenge();
      default:
        return null;
    }
  };

  const handleGameSuccess = () => {
    clearTimeout(patternTimer.current);
    setRoundStatus('complete');
    setFeedback('Challenge complete!');
  };

  const handleGameFailure = () => {
    const maxAttempts = difficultyLevels[difficulty]?.attemptsAllowed || 3;
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    clearTimeout(patternTimer.current);
    setRoundStatus(newAttempts >= maxAttempts ? 'failed' : 'retry');
    setFeedback(newAttempts >= maxAttempts ? 'That round is finished. You can start a fresh round.' : 'Not quite. Try another round.');
  };

  const handleTimeUp = () => {
    clearTimeout(patternTimer.current);
    setRoundStatus('timeout');
    setFeedback('Time is up. You can try again.');
  };

  // All answer paths are implemented and guarded against repeat completion.
  const canAnswer = () => {
    if (roundStatus !== 'playing' || actionLock.current) return false;
    actionLock.current = true;
    return true;
  };
  const checkMathAnswer = answer => {
    if (!canAnswer()) return;
    if (answer !== gameData.answer) return handleGameFailure();
    if (gameData.currentProblem >= gameData.totalProblems) return handleGameSuccess();
    initializeMathGame(gameData.currentProblem + 1);
  };
  const toggleMemoryCell = (row, col) => {
    if (roundStatus !== 'playing' || gameData.showingPattern) return;
    setGameData(prev => ({ ...prev, userPattern: prev.userPattern.map((cells, r) =>
      cells.map((cell, c) => r === row && c === col ? !cell : cell)) }));
  };
  const checkMemoryPattern = () => {
    if (!canAnswer() || gameData.showingPattern) return;
    if (samePattern(gameData.pattern, gameData.userPattern)) handleGameSuccess();
    else handleGameFailure();
  };
  const movePuzzleTile = index => {
    if (roundStatus !== 'playing') return;
    const tiles = moveTile(gameData.tiles, index, gameData.size);
    if (!tiles) return;
    setGameData(prev => ({ ...prev, tiles, moves: prev.moves + 1 }));
    if (tiles.every((tile, i) => tile === gameData.solved[i])) handleGameSuccess();
  };
  const typeCharacter = key => {
    if (roundStatus !== 'playing') return;
    if (key.toLowerCase() !== gameData.targetText[gameData.typedLength]?.toLowerCase()) {
      setFeedback('Try the highlighted character.'); return;
    }
    setFeedback('');
    const typedLength = gameData.typedLength + 1;
    setGameData(prev => ({ ...prev, typedLength }));
    if (typedLength === gameData.targetText.length) handleGameSuccess();
  };
  const countMovement = () => {
    if (!canAnswer()) return;
    const progress = gameData.progress + 1;
    setGameData(prev => ({ ...prev, progress }));
    if (progress >= gameData.target) handleGameSuccess();
  };
  const checkLogicAnswer = answer => {
    if (!canAnswer()) return;
    if (answer === gameData.answer) handleGameSuccess();
    else handleGameFailure();
  };
  const returnToGames = () => {
    clearTimeout(patternTimer.current);
    setCurrentGame(null); setRoundStatus('idle'); setFeedback(''); setShowGameSelector(true);
  };

  const getDifficultyDescription = () => {
    const level = difficultyLevels[difficulty] || difficultyLevels.normal;
    return `${level?.attemptsAllowed} attempts • ${Math.round(60 * level?.timeMultiplier)}s time limit`;
  };

  const getPhysicalHint = () => {
    switch (gameData.type) {
      case 'stretch':
        return 'Keep your phone still and move comfortably';
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

  const leaveAlternative=()=>{stopSpeech();setAlternative(null);setShowGameSelector(true);};
  if(alternative==='adaptive')return <View style={styles.container}><TouchableOpacity style={{padding:16}} onPress={leaveAlternative}><Text>← All challenges</Text></TouchableOpacity><AdaptiveTraining userProfile={userProfile} onNavigate={leaveAlternative} onRoundComplete={()=>{setAlternative(null);if(onGameComplete)onGameComplete();else setShowGameSelector(true);}}/></View>;
  if(alternative==='affirmation')return <ScrollView style={styles.container} contentContainerStyle={[styles.gameScreen,{padding:24,justifyContent:'center'}]}><Text style={styles.gameTitle}>One gentle step</Text><Text style={styles.memoryInstruction}>I can begin with one small step. I can pause, adjust, and try again.</Text><TouchableOpacity style={styles.submitButton} onPress={()=>speak('I can begin with one small step. I can pause, adjust, and try again.').catch(()=>Alert.alert('Audio unavailable','Read the words above, or choose another challenge.'))}><Text style={styles.submitButtonText}>Listen</Text></TouchableOpacity><TouchableOpacity style={styles.submitButton} onPress={()=>{stopSpeech();if(onGameComplete)onGameComplete();else leaveAlternative();}}><Text style={styles.submitButtonText}>I’m ready to begin</Text></TouchableOpacity><TouchableOpacity style={styles.giveUpButton} onPress={leaveAlternative}><Text style={styles.giveUpText}>Choose another challenge</Text></TouchableOpacity></ScrollView>;
  return (
    <View style={styles.container}>
      {GameSelector()}
      
      {currentGame && (
        <ScrollView style={styles.container} contentContainerStyle={styles.gameScreen} keyboardShouldPersistTaps="handled">
          <View style={styles.gameHeader}>
            <Text style={styles.timeLeft}>⏱️ {timeLeft}s</Text>
            <Text style={styles.attempts}>
              Attempt {Math.min(attempts + 1, difficultyLevels[difficulty]?.attemptsAllowed || 3)}/{difficultyLevels[difficulty]?.attemptsAllowed || 3}
            </Text>
          </View>

          {roundStatus === 'playing' ? renderCurrentGame() : (
            <View style={styles.gameContainer}>
              <Text accessibilityRole="alert" style={styles.gameTitle}>{feedback}</Text>
              <TouchableOpacity style={styles.submitButton} accessibilityRole="button" onPress={() => {
                if (roundStatus !== 'retry') setAttempts(0);
                initializeGame(currentGame);
              }}><Text style={styles.submitButtonText}>Play again</Text></TouchableOpacity>
              {roundStatus === 'complete' && typeof onGameComplete === 'function' && (
                <TouchableOpacity style={styles.submitButton} accessibilityRole="button" onPress={onGameComplete}>
                  <Text style={styles.submitButtonText}>Continue</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {roundStatus === 'playing' && !!feedback && <Text accessibilityRole="alert" style={styles.memoryInstruction}>{feedback}</Text>}

          <TouchableOpacity
            style={styles.giveUpButton}
            accessibilityRole="button"
            onPress={returnToGames}
          >
            <Text style={styles.giveUpText}>Choose another game</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
  },
  
  // Game Selector Styles
  selectorContainer: {
    flexGrow: 1,
    paddingTop: 44,
    paddingBottom: 40,
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
    color: sunrise.ink,
    fontWeight: '800',
  },
  selectorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: sunrise.ink,
    marginBottom: 8,
  },
  selectorSubtitle: {
    fontSize: 16,
    color: sunrise.muted,
    textAlign: 'center',
  },
  gameList: {
    padding: 20,
  },
  gameOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
    fontSize: 16,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  gameDescription: {
    fontSize: 14,
    color: sunrise.muted,
    marginTop: 2,
  },
  supportBadge: {
    fontSize: 12,
    color: '#217F77',
    marginTop: 4,
    fontWeight: '500',
  },
  selectArrow: {
    fontSize: 20,
  },
  difficultyInfo: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: sunrise.border,
  },
  difficultyLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: sunrise.ink,
    textAlign: 'center',
  },
  difficultyDescription: {
    fontSize: 14,
    color: sunrise.muted,
    textAlign: 'center',
    marginTop: 4,
  },

  // Game Screen Styles
  gameScreen: {
    flexGrow: 1,
    paddingTop: 24,
    paddingBottom: 40,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: sunrise.border,
  },
  timeLeft: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF5722',
  },
  attempts: {
    fontSize: 16,
    color: sunrise.muted,
  },
  gameContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  gameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: sunrise.ink,
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
    color: sunrise.ink,
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
    backgroundColor: sunrise.orangeTint,
    padding: 15,
    borderRadius: 10,
    margin: 5,
    minWidth: 80,
  },
  answerText: {
    fontSize: 20,
    color: sunrise.ink,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  progressText: {
    color: sunrise.muted,
    fontSize: 16,
    marginTop: 10,
  },

  // Memory Game Styles
  memoryGrid: {
    alignItems: 'center',
  },
  memoryInstruction: {
    color: sunrise.ink,
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
    backgroundColor: '#DED8D0',
  },
  submitButton: {
    backgroundColor: sunrise.orange,
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  submitButtonText: {
    color: sunrise.ink,
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
    backgroundColor: sunrise.orangeTint,
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
    color: sunrise.ink,
  },
  movesText: {
    color: sunrise.muted,
    fontSize: 16,
    marginTop: 20,
  },

  // Typing Game Styles
  typingContainer: {
    width: '100%',
  },
  typingText: {
    fontSize: 20,
    color: sunrise.ink,
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
    color: sunrise.muted,
  },
  currentChar: {
    backgroundColor: '#DED8D0',
  },
  keyboard: {
    alignItems: 'center',
  },
  keyboardRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  keyButton: {
    backgroundColor: sunrise.orangeTint,
    padding: 5,
    margin: 2,
    borderRadius: 6,
    minWidth: 24,
    minHeight: 44,
  },
  keyText: {
    color: sunrise.ink,
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
    color: sunrise.ink,
    textAlign: 'center',
    marginBottom: 30,
  },
  progressCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  progressNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  progressTarget: {
    fontSize: 20,
    color: sunrise.muted,
  },
  physicalHint: {
    fontSize: 16,
    color: sunrise.muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Logic Game Styles
  logicContainer: {
    width: '100%',
  },
  logicQuestion: {
    fontSize: 18,
    color: sunrise.ink,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  logicOptions: {
    width: '100%',
  },
  logicOption: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  logicOptionText: {
    fontSize: 16,
    color: sunrise.ink,
    textAlign: 'center',
  },
});

export default MiniGameChallengeSystem;

