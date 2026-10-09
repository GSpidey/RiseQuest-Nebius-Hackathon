/**
 * Quest Card Component - Individual Quest Display
 * Shows quest progress, subtasks, and actions
 */

import { sunrise } from './SunriseUI';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';

const QuestCard = ({ 
  quest, 
  onProgress, 
  onDelete, 
  onFocusMode, 
  getDifficultyColor, 
  getProgressColor 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [animation] = useState(new Animated.Value(0));

  const toggleExpanded = () => {
    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);
    
    Animated.spring(animation, {
      toValue,
      useNativeDriver: false,
    }).start();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getNextStep = () => {
    return quest.subtasks.find(task => !task.completed);
  };

  const handleSubtaskToggle = (subtaskId, completed) => {
    // Prevent marking future steps as complete if previous steps aren't done
    const subtaskIndex = quest.subtasks.findIndex(task => task.id === subtaskId);
    const previousSubtasks = quest.subtasks.slice(0, subtaskIndex);
    const hasIncompletePrerequisites = previousSubtasks.some(task => !task.completed);

    if (completed && hasIncompletePrerequisites) {
      Alert.alert(
        'Complete Previous Steps First',
        'You need to complete the previous steps before moving to this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    Promise.resolve(onProgress(quest.id, subtaskId, completed)).catch(() => {});
  };

  const nextStep = getNextStep();

  return (
    <View style={styles.card}>
      {/* Quest Header */}
      <TouchableOpacity onPress={toggleExpanded} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{quest.title}</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(quest.difficulty) }]}>
              <Text style={styles.difficultyText}>{quest.difficulty.toUpperCase()}</Text>
            </View>
          </View>
          
          <Text style={styles.description} numberOfLines={2}>
            {quest.description}
          </Text>
          <Text style={styles.metaText}>
            {quest.syncStatus === 'local-only' ? 'On this device only · prepared offline steps · no points' :
              quest.breakdownSource === 'ai' ? 'AI-generated steps · review before starting' :
              quest.breakdownSource === 'curated' ? 'Prepared routine steps · not AI' :
              quest.breakdownSource === 'offline' ? 'Prepared steps · AI was unavailable' : 'Saved quest steps'}
            {quest.offline ? ' · offline copy' : ''}
          </Text>
          
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {quest.progress}% • {quest.currentStep}/{quest.totalSteps} steps
            </Text>
            <Text style={styles.metaText}>
              📅 {formatDate(quest.createdAt)}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
        </View>
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${quest.progress}%`,
                backgroundColor: getProgressColor(quest.progress)
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{quest.progress}%</Text>
      </View>

      {/* Next Step Preview (when collapsed) */}
      {!expanded && nextStep && (
        <View style={styles.nextStepPreview}>
          <Text style={styles.nextStepLabel}>🎯 Next Step:</Text>
          <Text style={styles.nextStepText}>{nextStep.title}</Text>
        </View>
      )}

      {/* Expanded Content */}
      {expanded && (
        <Animated.View style={[styles.expandedContent, { opacity: animation }]}>
          {/* Quest Info */}
          <View style={styles.questInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>⏱️ Estimated Time:</Text>
              <Text style={styles.infoValue}>{formatTime(quest.estimatedTotalMinutes)}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>📂 Category:</Text>
              <Text style={styles.infoValue}>{quest.category}</Text>
            </View>
            
            {quest.tags && quest.tags.length > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>🏷️ Tags:</Text>
                <View style={styles.tagsContainer}>
                  {quest.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Subtasks List */}
          <View style={styles.subtasksContainer}>
            <Text style={styles.subtasksTitle}>📋 Quest Steps ({quest.currentStep}/{quest.totalSteps})</Text>
            
            {quest.subtasks.map((subtask, index) => {
              const isCompleted = subtask.completed;
              const isCurrent = !isCompleted && index === quest.currentStep;
              const isLocked = index > quest.currentStep;

              return (
                <View key={subtask.id} style={[
                  styles.subtask,
                  isCompleted && styles.subtaskCompleted,
                  isCurrent && styles.subtaskCurrent,
                  isLocked && styles.subtaskLocked
                ]}>
                  <TouchableOpacity
                    style={styles.subtaskToggle}
                    onPress={() => handleSubtaskToggle(subtask.id, !isCompleted)}
                    disabled={isLocked}
                  >
                    <View style={[
                      styles.checkbox,
                      isCompleted && styles.checkboxCompleted,
                      isCurrent && styles.checkboxCurrent
                    ]}>
                      {isCompleted && <Text style={styles.checkmark}>✓</Text>}
                      {isCurrent && !isCompleted && <Text style={styles.currentDot}>●</Text>}
                    </View>
                    
                    <View style={styles.subtaskContent}>
                      <Text style={[
                        styles.subtaskTitle,
                        isCompleted && styles.subtaskTitleCompleted,
                        isLocked && styles.subtaskTitleLocked
                      ]}>
                        {subtask.title}
                      </Text>
                      
                      <View style={styles.subtaskMeta}>
                        <Text style={styles.subtaskMetaText}>
                          Step {index + 1} • {formatTime(subtask.estimatedMinutes)}
                        </Text>
                        {isCompleted && subtask.completedAt && (
                          <Text style={styles.completedDate}>
                            ✅ {formatDate(subtask.completedAt)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.focusButton]}
              onPress={() => onFocusMode(quest)}
              disabled={quest.status === 'completed'}
            >
              <Text style={styles.actionButtonText}>
                🎯 {quest.status === 'completed' ? 'Completed' : 'Focus Mode'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => onDelete(quest.id, quest.title)}
            >
              <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#f0f0f3',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    padding: 24,
    alignItems: 'flex-start',
    backgroundColor: sunrise.orangeTint,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    marginLeft: 15,
    backgroundColor: sunrise.orangeTint,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1e',
    flex: 1,
    marginRight: 12,
    letterSpacing: 0.3,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  difficultyText: {
    color: sunrise.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(249, 250, 251, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginHorizontal: -4,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 14,
    color: '#9A4700',
    fontWeight: '800',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '800',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  nextStepPreview: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 8,
    paddingTop: 20,
    backgroundColor: sunrise.orangeTint,
    marginHorizontal: 12,
    borderRadius: 16,
  },
  nextStepLabel: {
    fontSize: 13,
    color: '#9A4700',
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  nextStepText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
    lineHeight: 20,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  questInfo: {
    padding: 24,
    backgroundColor: 'rgba(249, 250, 251, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '700',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: sunrise.orange,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 6,
    marginBottom: 6,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  tagText: {
    color: sunrise.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  subtasksContainer: {
    padding: 24,
  },
  subtasksTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  subtask: {
    marginBottom: 16,
  },
  subtaskCompleted: {
    opacity: 0.6,
  },
  subtaskCurrent: {
    backgroundColor: sunrise.orangeTint,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: -8,
    borderWidth: 2,
    borderColor: sunrise.orangeTint,
  },
  subtaskLocked: {
    opacity: 0.3,
  },
  subtaskToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  checkboxCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  checkboxCurrent: {
    borderColor: sunrise.orange,
    backgroundColor: sunrise.orange,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  checkmark: {
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  currentDot: {
    color: sunrise.ink,
    fontSize: 10,
  },
  subtaskContent: {
    flex: 1,
  },
  subtaskTitle: {
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 6,
    fontWeight: '600',
    lineHeight: 22,
  },
  subtaskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  subtaskTitleLocked: {
    color: '#d1d5db',
  },
  subtaskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 250, 251, 0.8)',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  subtaskMetaText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  completedDate: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  focusButton: {
    backgroundColor: sunrise.orange,
    shadowColor: sunrise.orange,
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f87171',
    shadowColor: '#f87171',
  },
  actionButtonText: {
    color: sunrise.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default QuestCard;
