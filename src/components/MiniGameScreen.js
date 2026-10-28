import { AppAlert as Alert } from './AppModal';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Vibration, ScrollView } from 'react-native';
import {sunrise, SunriseIcon} from './SunriseUI';
import {ThemeBackdrop, MotionScreen, useReducedMotion} from '../features/customization/ThemeMotion';
import CosmeticArtwork from './CosmeticArtwork';

const { width, height } = Dimensions.get('window');

const triggerHaptic = (style = 'light') => {
  const duration = style === 'medium' ? 20 : 10;
  Vibration.vibrate(duration);
};

const MiniGameScreen = ({
  gameType = 'math',
  difficulty = 'medium',
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
  const memoryTimer = useRef(null), holdTimer = useRef(null);
  const [physicalCount,setPhysicalCount]=useState(0);
  const reduced=useReducedMotion();
  useEffect(()=>()=>{clearTimeout(memoryTimer.current);clearTimeout(holdTimer.current);},[]);
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
    clearTimeout(memoryTimer.current);
    memoryTimer.current = setTimeout(() => {
      setCurrentChallenge(prev => prev?.type === 'memory' ? ({ ...prev, showSequence: false }) : prev);
    }, sequenceLength * 800 + 1000);
  };

  const generateReactionChallenge = () => {
    const targetCount = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 8 : 12;
    const targets = Array.from({ length: targetCount }, (_, i) => ({
      id: i,
      x: 5 + (i % 3) * 30 + Math.random() * 5,
      y: 5 + Math.floor(i / 3) * 22 + Math.random() * 4,
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
    if(!reduced)triggerHaptic('light');

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
    if(endedRef.current || currentChallenge.showSequence || answerBusyRef.current)return;
    answerBusyRef.current=true;
    const newSequence = [...currentChallenge.userSequence, color];
    const isCorrect = newSequence.every((item, index) => 
      item === currentChallenge.sequence[index]
    );
    
    if (!isCorrect) {
      handleGameEnd(false);
      return;
    }
    
    if (newSequence.length === currentChallenge.sequence.length) {
      handleGameEnd(true, getTargetScore());
    } else {
      setCurrentChallenge(prev => ({
        ...prev,
        userSequence: newSequence,
      }));
    }
  };

  const handleTargetHit = (targetId) => {
    if(endedRef.current || answerBusyRef.current || currentChallenge.targets.find(t=>t.id===targetId)?.hit)return;
    answerBusyRef.current=true;
    if(!reduced)triggerHaptic('medium');
    
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
      handleGameEnd(true, getTargetScore());
    }
  };

  const getTargetScore = () => {
    return difficulty === 'easy' ? 3 : difficulty === 'medium' ? 5 : 8;
  };

  const handleGameEnd = (success, finalScore = scoreRef.current) => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimeout(memoryTimer.current);clearTimeout(holdTimer.current);
    scoreRef.current=finalScore;setScore(finalScore);
    setResultSuccess(success);
    setGameState('finished');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (success && !lockExit) {
      if(!reduced)triggerHaptic('medium');
      onComplete(finalScore);
    } else if (!success && !lockExit) {
      if(!reduced)triggerHaptic('medium');
      onFail();
    }
  };

  const startGame = () => {
    scoreRef.current = 0;
    endedRef.current = false;
    answerBusyRef.current = false;
    setResultSuccess(false);
    setFeedback('');
    clearTimeout(memoryTimer.current);clearTimeout(holdTimer.current);setPhysicalCount(0);
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
      <View style={{flexDirection:'row',alignItems:'center',gap:9,flex:1}}><View style={{padding:9,borderRadius:15,backgroundColor:sunrise.orangeTint}}><SunriseIcon name={lockExit?'alarm':'games'} size={24} color='#A55C00'/></View><Text style={styles.challengeTitle}>{lockExit ? 'Wake-up challenge' : 'Play & shine'}</Text></View>
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
      <View style={styles.container}><ThemeBackdrop/>
        {header}
        <ScrollView style={{flex:1}} contentContainerStyle={styles.readyScreen}>
          <MotionScreen screenKey={gameType} style={{flex:0,marginBottom:22}}><CosmeticArtwork id={{math:'anim_sparkles',memory:'anim_petals',reaction:'anim_fireworks',physical:'sound_motivational'}[gameType]||'anim_sparkles'} size={144}/></MotionScreen>
          <Text style={styles.gameTitle}>{{math:'Rise & solve',memory:'Memory garden',reaction:'Catch a spark',physical:'Move into morning'}[gameType]||'Wake-up challenge'}</Text>
          <Text style={styles.gameSubtitle}>{lockExit ? (gameType==='math'?'Three correct answers unlock Stop alarm and Snooze. You can keep going to finish the round.':'Complete this round to unlock Stop alarm and Snooze.') : `Complete the ${gameType} challenge`}</Text>
          <View style={styles.pills}><Text style={styles.pill}>{difficulty.charAt(0).toUpperCase()+difficulty.slice(1)}</Text><Text style={styles.pill}>30 seconds</Text><Text style={styles.pill}>{gameType==='math'?`${getTargetScore()} answers`:'One round'}</Text></View>
          
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Start Challenge 🚀</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (gameState === 'finished') {
    return (
      <View style={styles.container}><ThemeBackdrop/>
        {header}
        {alarmActions}
        <ScrollView style={{flex:1}} contentContainerStyle={styles.finishedScreen}>
          <Text style={styles.resultTitle}>{resultSuccess ? 'You’re awake! 🎉' : 'Round finished'}</Text>
          <CosmeticArtwork id={resultSuccess?'anim_fireworks':'anim_petals'} size={135}/><Text style={styles.scoreText}>Final Score: {score}</Text>
          <Text style={styles.motivationText}>{resultSuccess ? 'Stop or snooze your alarm whenever you’re ready.' : 'No pressure. Try another round to unlock your alarm controls.'}</Text>
          {!resultSuccess && <TouchableOpacity accessibilityRole="button" style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>Try again</Text>
          </TouchableOpacity>}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}><ThemeBackdrop/>
      {header}
      {alarmActions}
      <View style={styles.gameHeader}>
        <Text style={styles.timerText}>⏱️ {timeLeft}s</Text>
        <Text style={styles.scoreText}>Score: {score}/{getTargetScore()}</Text>
      </View>

      <View style={styles.track} accessibilityRole='progressbar' accessibilityValue={{min:0,max:getTargetScore(),now:score}}><View style={[styles.fill,{width:`${Math.min(100,score/getTargetScore()*100)}%`}]}/></View>
      {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{feedback}</Text>}

      <ScrollView style={{flex:1}} contentContainerStyle={styles.gameArea} keyboardShouldPersistTaps="handled">
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

        {gameType === 'physical' && currentChallenge && <View style={styles.physicalGame}>
          <SunriseIcon name='today' size={76} color={sunrise.orange}/>
          <Text style={styles.instructionText}>{currentChallenge.action==='hold'?'Hold to greet the day':'Ten gentle taps to begin'}</Text>
          <Text style={styles.gameSubtitle}>{currentChallenge.action==='hold'?'Keep your finger here for three seconds.':'Stay comfortable and tap at your own pace.'}</Text>
          {currentChallenge.action==='hold'?<TouchableOpacity accessibilityRole='button' accessibilityLabel='Hold for three seconds' style={styles.startButton}
            onPressIn={()=>{clearTimeout(holdTimer.current);holdTimer.current=setTimeout(()=>handleGameEnd(true,getTargetScore()),3000);}}
            onPressOut={()=>clearTimeout(holdTimer.current)}><Text style={styles.startButtonText}>Hold here</Text></TouchableOpacity>:
            <TouchableOpacity accessibilityRole='button' style={styles.startButton} onPress={()=>{if(endedRef.current)return;const n=physicalCount+1;setPhysicalCount(n);if(n>=10)handleGameEnd(true,getTargetScore());}}><Text style={styles.startButtonText}>{physicalCount} / 10 · Tap</Text></TouchableOpacity>}
        </View>}
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
                      left: `${target.x}%`,
                      top: `${target.y}%`,
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  track:{height:8,borderRadius:4,backgroundColor:'#EAE1D8',marginHorizontal:20,overflow:'hidden'},fill:{height:8,borderRadius:4,backgroundColor:sunrise.teal},
  pills:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8,marginBottom:24},pill:{padding:10,borderRadius:14,backgroundColor:'#FFFFFF',color:sunrise.muted,fontWeight:'700'},
  physicalGame:{flex:1,alignItems:'center',justifyContent:'center',gap:18},
  alarmActions: { padding: 12, margin:12, borderRadius:24, gap: 8, backgroundColor: '#E6F6EA' },
  unlockedText: { color: '#334155', textAlign: 'center', fontSize: 14 },
  stopAlarmButton: { minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: '#A84400', alignItems: 'center' },
  snoozeAlarmButton: { minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: '#5841B5', alignItems: 'center' },
  alarmActionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  feedbackText: { color: '#334155', paddingHorizontal: 16, paddingTop: 8, textAlign: 'center' },
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
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
    color: sunrise.ink,
  },
  giveUpButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: sunrise.purpleTint,
  },
  giveUpButtonDisabled: {
    backgroundColor: '#E9E2D9',
  },
  giveUpText: {
    color: sunrise.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  giveUpTextDisabled: {
    color: sunrise.muted,
  },
  readyScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  finishedScreen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  gameTitle: {
    fontSize: 27,
    fontWeight: 'bold',
    color: sunrise.ink,
    marginBottom: 10,
    textAlign: 'center',
  },
  gameSubtitle: {
    fontSize: 18,
    color: sunrise.ink,
    opacity: 0.9,
    marginBottom: 20,
    textAlign: 'center',
  },
  difficultyText: {
    fontSize: 16,
    color: sunrise.ink,
    opacity: 0.8,
    marginBottom: 10,
  },
  targetText: {
    fontSize: 16,
    color: sunrise.ink,
    opacity: 0.8,
    marginBottom: 30,
  },
  startButton: {
    backgroundColor: sunrise.orange,
    borderRadius: 25,
    paddingHorizontal: 40,
    paddingVertical: 15,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: sunrise.ink,
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
    color: sunrise.ink,
  },
  gameArea: {
    flexGrow: 1,
    paddingBottom: 48,
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
    borderWidth:2,borderColor:'#F5D9B5',
    backgroundColor: '#FFF0DB',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: sunrise.ink,
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
    flexWrap:'wrap',
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
    flexWrap:'wrap',
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
    color: sunrise.ink,
    textAlign: 'center',
    marginBottom: 20,
  },
  targetArea: {
    height: 400,
    borderRadius:26, backgroundColor:'#F0ECFF', overflow:'hidden',
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
    color: sunrise.ink,
    marginBottom: 20,
    textAlign: 'center',
  },
  motivationText: {
    fontSize: 18,
    color: sunrise.ink,
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default MiniGameScreen;

