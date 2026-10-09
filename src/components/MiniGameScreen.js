import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Vibration,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const { width, height } = Dimensions.get('window');

const triggerHaptic = (style = 'light') => {
  const duration = style === 'medium' ? 20 : 10;
  Vibration.vibrate(duration);
};

const MiniGameScreen = ({
  gameType,
  difficulty,
  onComplete,
  onFail,
  lockExit = false,
  giveUpEnabledAt = 0,
  onGiveUp = null,
  onRequestClose = null,
  onAlarmAction = null,
}) => {
  const [gameState, setGameState] = useState('ready');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [giveUpSecondsLeft, setGiveUpSecondsLeft] = useState(0);
  const timerRef = useRef(null);
  const scoreRef = useRef(0);
  const endedRef = useRef(false);
  const answerBusyRef = useRef(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [feedback, setFeedback] = useState('');
  const alarmUnlocked = lockExit && (score >= 3 || resultSuccess);

  // Block duplicate taps on the old question until the new one has rendered.
  useEffect(() => { answerBusyRef.current = false; }, [currentChallenge]);

  useEffect(() => {
    if (gameState === 'playing' && timeLeft === 0) {
      handleGameEnd(scoreRef.current >= 3 && lockExit, scoreRef.current);
    }
  }, [timeLeft, gameState]);

  useEffect(() => {
    if (gameState === 'playing') {
      generateChallenge();
      startTimer();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (!lockExit) {
      setGiveUpSecondsLeft(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Number(giveUpEnabledAt || 0) - Date.now()) / 1000));
      setGiveUpSecondsLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lockExit, giveUpEnabledAt]);

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
  };

  const generateChallenge = () => {
    switch (gameType) {
      case 'math':
        generateMathChallenge();
        break;
      case 'memory':
        generateMemoryChallenge();
        break;
      case 'reaction':
        generateReactionChallenge();
        break;
      case 'physical':
        generatePhysicalChallenge();
        break;
      default:
        generateMathChallenge();
    }
  };

  const generateMathChallenge = () => {
    const difficultyMultiplier = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 50 : 100;
    const a = Math.floor(Math.random() * difficultyMultiplier) + 1;
    const b = Math.floor(Math.random() * difficultyMultiplier) + 1;
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer;
    let question;
    
    switch (operation) {
      case '+':
        answer = a + b;
        question = `${a} + ${b}`;
        break;
      case '-':
        answer = Math.abs(a - b);
        question = `${Math.max(a, b)} - ${Math.min(a, b)}`;
        break;
      case '*':
        const smallA = Math.floor(Math.random() * 12) + 1;
        const smallB = Math.floor(Math.random() * 12) + 1;
        answer = smallA * smallB;
        question = `${smallA} × ${smallB}`;
        break;
    }
    
    const wrongAnswers = [
      answer + Math.floor(Math.random() * 5) + 1,
      answer - Math.floor(Math.random() * 5) - 1,
      answer + Math.floor(Math.random() * 10) + 5,
    ];
    
    const options = [answer, ...wrongAnswers].sort(() => Math.random() - 0.5);
    
    setCurrentChallenge({
      question,
      options,
      correctAnswer: answer,
      type: 'math',
    });
  };

  const generateMemoryChallenge = () => {
    const colors = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];
    const sequenceLength = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 5 : 7;
    const sequence = Array.from({ length: sequenceLength }, () => 
      colors[Math.floor(Math.random() * colors.length)]
    );
    
    setCurrentChallenge({
      sequence,
      userSequence: [],
      showSequence: true,
      type: 'memory',
    });
    
    // Hide sequence after showing it
    setTimeout(() => {
      setCurrentChallenge(prev => ({ ...prev, showSequence: false }));
    }, sequenceLength * 800 + 1000);
  };

  const generateReactionChallenge = () => {
    const targetCount = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 8 : 12;
    const targets = Array.from({ length: targetCount }, (_, i) => ({
      id: i,
      x: Math.random() * (width - 80),
      y: Math.random() * (height - 200) + 100,
      hit: false,
    }));
    
    setCurrentChallenge({
      targets,
      hitCount: 0,
      targetCount,
      type: 'reaction',
    });
  };

  const generatePhysicalChallenge = () => {
    const actions = [
      { action: 'shake', text: 'Shake your phone!', icon: '📱' },
      { action: 'tap', text: 'Tap the screen 10 times!', icon: '👆', count: 0, target: 10 },
      { action: 'hold', text: 'Hold this button for 3 seconds!', icon: '✋', progress: 0 },
    ];
    
    const selectedAction = actions[Math.floor(Math.random() * actions.length)];
    setCurrentChallenge({
      ...selectedAction,
      type: 'physical',
    });
  };

  const handleAnswer = (answer) => {
    if (endedRef.current || answerBusyRef.current || gameState !== 'playing') return;
    answerBusyRef.current = true;
    triggerHaptic('light');

    if (answer === currentChallenge.correctAnswer) {
      const next = scoreRef.current + 1;
      scoreRef.current = next;
      setScore(next);
      setFeedback(next >= 3 && lockExit ? 'You can stop or snooze now, or keep going.' : 'Correct — keep going!');
      if (next >= getTargetScore()) handleGameEnd(true, next);
      else generateChallenge();
    } else {
      setFeedback('Not quite — try the next question. Your correct answers still count.');
      generateChallenge();
    }
  };

  const handleMemorySequence = (color) => {
    const newSequence = [...currentChallenge.userSequence, color];
    const isCorrect = newSequence.every((item, index) => 
      item === currentChallenge.sequence[index]
    );
    
    if (!isCorrect) {
      handleGameEnd(false);
      return;
    }
    
    if (newSequence.length === currentChallenge.sequence.length) {
      handleGameEnd(true);
    } else {
      setCurrentChallenge(prev => ({
        ...prev,
        userSequence: newSequence,
      }));
    }
  };

  const handleTargetHit = (targetId) => {
    triggerHaptic('medium');
    
    const newTargets = currentChallenge.targets.map(target =>
      target.id === targetId ? { ...target, hit: true } : target
    );
    
    const hitCount = newTargets.filter(t => t.hit).length;
    
    setCurrentChallenge(prev => ({
      ...prev,
      targets: newTargets,
      hitCount,
    }));
    
    if (hitCount >= currentChallenge.targetCount) {
      handleGameEnd(true);
    }
  };

  const getTargetScore = () => {
    return difficulty === 'easy' ? 3 : difficulty === 'medium' ? 5 : 8;
  };

  const handleGameEnd = (success, finalScore = scoreRef.current) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setResultSuccess(success);
    setGameState('finished');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (success && !lockExit) {
      triggerHaptic('medium');
      onComplete(finalScore);
    } else if (!success && !lockExit) {
      triggerHaptic('medium');
      onFail();
    }
  };

  const startGame = () => {
    scoreRef.current = 0;
    endedRef.current = false;
    answerBusyRef.current = false;
    setResultSuccess(false);
    setFeedback('');
    setGameState('playing');
    setScore(0);
    setTimeLeft(30);
  };

  const alarmActions = alarmUnlocked && (
    <View style={styles.alarmActions}>
      <Text accessibilityLiveRegion="polite" style={styles.unlockedText}>You’re awake — choose when to stop.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.stopAlarmButton}
        onPress={() => onAlarmAction?.('dismiss', scoreRef.current)}>
        <Text style={styles.alarmActionText}>Stop alarm</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.snoozeAlarmButton}
        onPress={() => onAlarmAction?.('snooze', scoreRef.current)}>
        <Text style={styles.alarmActionText}>Snooze · 5 minutes</Text>
      </TouchableOpacity>
    </View>
  );

  const handleGiveUpPress = () => {
    if (!lockExit) {
      if (typeof onRequestClose === 'function') onRequestClose();
      return;
    }

    const remaining = Math.max(0, Math.ceil((Number(giveUpEnabledAt || 0) - Date.now()) / 1000));
    if (remaining > 0) {
      Alert.alert('Give Up', `Give up will unlock in ${remaining}s.`);
      return;
    }
    if (typeof onGiveUp === 'function') {
      onGiveUp();
    }
  };

  const header = (
    <View style={styles.challengeHeader}>
      <Text style={styles.challengeTitle}>{lockExit ? 'Alarm Challenge' : 'Mini Game'}</Text>
      <TouchableOpacity
        onPress={handleGiveUpPress}
        disabled={lockExit && giveUpSecondsLeft > 0}
        style={[styles.giveUpButton, (lockExit && giveUpSecondsLeft > 0) ? styles.giveUpButtonDisabled : null]}
      >
        <Text style={[styles.giveUpText, (lockExit && giveUpSecondsLeft > 0) ? styles.giveUpTextDisabled : null]}>
          {lockExit ? (giveUpSecondsLeft > 0 ? `Give up in ${giveUpSecondsLeft}s` : 'Give up') : 'Close'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (gameState === 'ready') {
    return (
      <View style={styles.container}>
        {header}
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.readyScreen}>
          <Text style={styles.gameTitle}>Wake-Up Challenge!</Text>
          <Text style={styles.gameSubtitle}>{lockExit ? 'Three correct answers unlock Stop alarm and Snooze. You can keep going to finish the round.' : `Complete the ${gameType} challenge`}</Text>
          <Text style={styles.difficultyText}>Difficulty: {difficulty.toUpperCase()}</Text>
          <Text style={styles.targetText}>Target Score: {getTargetScore()}</Text>
          
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Start Challenge 🚀</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  if (gameState === 'finished') {
    return (
      <View style={styles.container}>
        {header}
        {alarmActions}
        <LinearGradient colors={resultSuccess ? ['#168B77', '#126B62'] : ['#7C5CFC', '#5841B5']} style={styles.finishedScreen}>
          <Text style={styles.resultTitle}>{resultSuccess ? 'You’re awake! 🎉' : 'Round finished'}</Text>
          <Text style={styles.scoreText}>Final Score: {score}</Text>
          <Text style={styles.motivationText}>{resultSuccess ? 'Stop or snooze your alarm whenever you’re ready.' : 'No pressure. Try another round to unlock your alarm controls.'}</Text>
          {!resultSuccess && <TouchableOpacity accessibilityRole="button" style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Try again</Text>
          </TouchableOpacity>}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {alarmActions}
      <View style={styles.gameHeader}>
        <Text style={styles.timerText}>⏱️ {timeLeft}s</Text>
        <Text style={styles.scoreText}>Score: {score}/{getTargetScore()}</Text>
      </View>

      {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{feedback}</Text>}

      <View style={styles.gameArea}>
        {gameType === 'math' && currentChallenge && (
          <View style={styles.mathGame}>
            <Text style={styles.questionText}>{currentChallenge.question} = ?</Text>
            <View style={styles.optionsGrid}>
              {currentChallenge.options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionButton}
                  onPress={() => handleAnswer(option)}
                >
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {gameType === 'memory' && currentChallenge && (
          <View style={styles.memoryGame}>
            {currentChallenge.showSequence ? (
              <View>
                <Text style={styles.instructionText}>Remember this sequence:</Text>
                <View style={styles.sequenceDisplay}>
                  {currentChallenge.sequence.map((color, index) => (
                    <Text key={index} style={styles.sequenceItem}>{color}</Text>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.instructionText}>Repeat the sequence:</Text>
                <View style={styles.colorButtons}>
                  {['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'].map((color, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.colorButton}
                      onPress={() => handleMemorySequence(color)}
                    >
                      <Text style={styles.colorText}>{color}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.userSequence}>
                  {currentChallenge.userSequence.map((color, index) => (
                    <Text key={index} style={styles.userSequenceItem}>{color}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {gameType === 'reaction' && currentChallenge && (
          <View style={styles.reactionGame}>
            <Text style={styles.instructionText}>Tap all the targets!</Text>
            <Text style={styles.progressText}>{currentChallenge.hitCount}/{currentChallenge.targetCount}</Text>
            <View style={styles.targetArea}>
              {currentChallenge.targets.map((target) => (
                <TouchableOpacity
                  key={target.id}
                  style={[
                    styles.target,
                    {
                      left: target.x,
                      top: target.y,
                      opacity: target.hit ? 0.3 : 1,
                    },
                  ]}
                  onPress={() => !target.hit && handleTargetHit(target.id)}
                  disabled={target.hit}
                >
                  <Text style={styles.targetText}>🎯</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  alarmActions: { padding: 12, gap: 8, backgroundColor: '#FFF7ED' },
  unlockedText: { color: '#334155', textAlign: 'center', fontSize: 14 },
  stopAlarmButton: { minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: '#A84400', alignItems: 'center' },
  snoozeAlarmButton: { minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: '#5841B5', alignItems: 'center' },
  alarmActionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  feedbackText: { color: '#334155', paddingHorizontal: 16, paddingTop: 8, textAlign: 'center' },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  challengeHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  giveUpButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  giveUpButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  giveUpText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  giveUpTextDisabled: {
    color: '#f8fafc',
  },
  readyScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  finishedScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  gameTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textAlign: 'center',
  },
  gameSubtitle: {
    fontSize: 18,
    color: 'white',
    opacity: 0.9,
    marginBottom: 20,
    textAlign: 'center',
  },
  difficultyText: {
    fontSize: 16,
    color: 'white',
    opacity: 0.8,
    marginBottom: 10,
  },
  targetText: {
    fontSize: 16,
    color: 'white',
    opacity: 0.8,
    marginBottom: 30,
  },
  startButton: {
    backgroundColor: 'white',
    borderRadius: 25,
    paddingHorizontal: 40,
    paddingVertical: 15,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e53e3e',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  gameArea: {
    flex: 1,
    padding: 20,
  },
  mathGame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  optionButton: {
    backgroundColor: '#667eea',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  memoryGame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 20,
    textAlign: 'center',
  },
  sequenceDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  sequenceItem: {
    fontSize: 40,
    margin: 10,
  },
  colorButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  colorButton: {
    margin: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  colorText: {
    fontSize: 30,
  },
  userSequence: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  userSequenceItem: {
    fontSize: 30,
    margin: 5,
  },
  reactionGame: {
    flex: 1,
  },
  progressText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
    textAlign: 'center',
    marginBottom: 20,
  },
  targetArea: {
    flex: 1,
    position: 'relative',
  },
  target: {
    position: 'absolute',
    width: 60,
    height: 60,
    backgroundColor: '#fff',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 5,
  },
  targetText: {
    fontSize: 24,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  motivationText: {
    fontSize: 18,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default MiniGameScreen;
