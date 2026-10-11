/**
 * Create Quest Modal - Quest Creation Interface
 * AI-powered task breakdown with smart categorization
 */

import { sunrise } from './SunriseUI';
import ModalHeading from './ModalHeading';
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const CreateQuestModal = ({ visible, onClose, onCreate, userProfile }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const difficulties = [
    { value: 'easy', label: 'Easy', emoji: '🟢', description: '2-3 simple steps' },
    { value: 'medium', label: 'Medium', emoji: '🟡', description: '4-6 manageable steps' },
    { value: 'hard', label: 'Hard', emoji: '🔴', description: '7+ detailed steps' },
  ];

  const categories = [
    { value: 'general', label: 'General', emoji: '📋' },
    { value: 'learning', label: 'Learning', emoji: '📚' },
    { value: 'fitness', label: 'Fitness', emoji: '💪' },
    { value: 'work', label: 'Work', emoji: '💼' },
    { value: 'personal', label: 'Personal', emoji: '🏠' },
    { value: 'creative', label: 'Creative', emoji: '🎨' },
    { value: 'health', label: 'Health', emoji: '🏥' },
    { value: 'social', label: 'Social', emoji: '👥' },
  ];

  const suggestedTags = {
    learning: ['study', 'course', 'skill', 'practice', 'exam'],
    fitness: ['workout', 'exercise', 'strength', 'cardio', 'flexibility'],
    work: ['project', 'deadline', 'meeting', 'presentation', 'planning'],
    personal: ['organization', 'cleaning', 'finance', 'family', 'self-care'],
    creative: ['writing', 'design', 'art', 'music', 'photography'],
    health: ['doctor', 'therapy', 'medication', 'diet', 'sleep'],
    social: ['friends', 'family', 'networking', 'community', 'events'],
    general: ['planning', 'research', 'organize', 'complete', 'review']
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDifficulty('medium');
    setCategory('general');
    setTags([]);
    setNewTag('');
    setReminderEnabled(false);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addSuggestedTag = (tag) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a quest title.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please enter a quest description to help AI break it down.');
      return;
    }

    setLoading(true);

    try {
      const questData = {
        title: title.trim(),
        description: description.trim(),
        difficulty,
        category,
        tags,
        reminderEnabled,
        reminderTime: reminderEnabled ? new Date().toISOString() : null,
      };

      await onCreate(questData);
      resetForm();
    } catch (error) {
      console.error('Error creating quest:', error);
      Alert.alert('Error', 'Failed to create quest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getExampleQuests = () => {
    const examples = {
      learning: 'Learn React Native development',
      fitness: 'Start a morning workout routine',
      work: 'Complete quarterly project report',
      personal: 'Organize home office space',
      creative: 'Write a short story',
      health: 'Improve sleep schedule',
      social: 'Plan family reunion event',
      general: 'Plan a weekend trip'
    };
    return examples[category] || 'Complete my important task';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          style={styles.container} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <LinearGradient colors={[sunrise.orangeTint, '#FFE49A']} style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={handleClose} accessibilityRole="button" style={styles.cancelButton}>
                <Text style={styles.headerButton}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleCreate}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading, busy: loading }}
                style={[styles.createButton, loading && styles.createButtonDisabled]}
              >
                <Text style={styles.createButtonText}>
                  {loading ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <ModalHeading icon="quests" title="Create Quest" description="Turn something you want to do into manageable steps." />
            {/* Quest Title */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Quest Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder={getExampleQuests()}
                placeholderTextColor="#999"
                value={title}
                accessibilityLabel="Quest title"
                onChangeText={setTitle}
                maxLength={100}
              />
              <Text style={styles.charCount}>{title.length}/100</Text>
            </View>

            {/* Quest Description */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Description</Text>
              <Text style={styles.sectionSubtitle}>
                Provide details to help AI create better subtasks
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe what you want to accomplish, any specific requirements, timeline, or context that would help break this down into steps..."
                placeholderTextColor="#999"
                value={description}
                accessibilityLabel="Quest description"
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.charCount}>{description.length}/500</Text>
            </View>

            {/* Category Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📂 Category</Text>
              <View style={styles.categoryGrid}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryButton,
                      category === cat.value && styles.categoryButtonActive
                    ]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text style={[
                      styles.categoryText,
                      category === cat.value && styles.categoryTextActive
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Difficulty Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚡ Difficulty</Text>
              <Text style={styles.sectionSubtitle}>
                This affects how detailed the AI breakdown will be
              </Text>
              <View style={styles.difficultyContainer}>
                {difficulties.map((diff) => (
                  <TouchableOpacity
                    key={diff.value}
                    style={[
                      styles.difficultyButton,
                      difficulty === diff.value && styles.difficultyButtonActive
                    ]}
                    onPress={() => setDifficulty(diff.value)}
                  >
                    <Text style={styles.difficultyEmoji}>{diff.emoji}</Text>
                    <Text style={[
                      styles.difficultyLabel,
                      difficulty === diff.value && styles.difficultyLabelActive
                    ]}>
                      {diff.label}
                    </Text>
                    <Text style={styles.difficultyDescription}>
                      {diff.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tags */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏷️ Tags (Optional)</Text>
              
              {/* Current Tags */}
              {tags.length > 0 && (
                <View style={styles.currentTags}>
                  {tags.map((tag, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.tag}
                      onPress={() => removeTag(tag)}
                    >
                      <Text style={styles.tagText}>{tag}</Text>
                      <Text style={styles.removeTag}> ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Add Custom Tag */}
              <View style={styles.addTagContainer}>
                <TextInput
                  style={styles.tagInput}
                  placeholder="Add custom tag..."
                  placeholderTextColor="#999"
                  value={newTag}
                  onChangeText={setNewTag}
                  onSubmitEditing={addTag}
                />
                <TouchableOpacity style={styles.addTagButton} onPress={addTag}>
                  <Text style={styles.addTagButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Suggested Tags */}
              <Text style={styles.suggestedTitle}>Suggested for {categories.find(c => c.value === category)?.label}:</Text>
              <View style={styles.suggestedTags}>
                {suggestedTags[category]?.map((tag, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.suggestedTag,
                      tags.includes(tag) && styles.suggestedTagAdded
                    ]}
                    onPress={() => addSuggestedTag(tag)}
                    disabled={tags.includes(tag)}
                  >
                    <Text style={[
                      styles.suggestedTagText,
                      tags.includes(tag) && styles.suggestedTagTextAdded
                    ]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reminder Settings */}
            <View style={styles.section}>
              <View style={styles.reminderHeader}>
                <Text style={styles.sectionTitle}>🔔 Reminder</Text>
                <TouchableOpacity
                  style={[styles.toggle, reminderEnabled && styles.toggleActive]}
                  onPress={() => setReminderEnabled(!reminderEnabled)}
                >
                  <Text style={styles.toggleText}>
                    {reminderEnabled ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionSubtitle}>
                Get reminded to work on this quest
              </Text>
            </View>

            {/* AI Preview */}
            <View style={styles.aiPreview}>
              <Text style={styles.aiPreviewTitle}>🤖 AI Will Create:</Text>
              <View style={styles.aiPreviewList}>
                <Text style={styles.aiPreviewItem}>
                  • {difficulty === 'easy' ? '2-3' : difficulty === 'medium' ? '4-6' : '7+'} organized steps
                </Text>
                <Text style={styles.aiPreviewItem}>
                  • Logical execution order
                </Text>
                <Text style={styles.aiPreviewItem}>
                  • Time estimates for each step
                </Text>
                <Text style={styles.aiPreviewItem}>
                  • Progress tracking system
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerButton: {
    color: sunrise.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  cancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  headerTitle: {
    color: sunrise.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  createButton: {
    backgroundColor: '#6544BC',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: sunrise.muted,
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  form: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  formContent: { padding: 20, paddingBottom: 40 },
  section: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: sunrise.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 17,
    color: '#1f2937',
    borderWidth: 2,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 8,
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryButton: {
    flexBasis: '40%',
    flexGrow: 1,
    minHeight: 88,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryButtonActive: {
    borderColor: sunrise.orange,
    backgroundColor: sunrise.orangeTint,
    shadowColor: sunrise.orange,
    shadowOpacity: 0.2,
  },
  categoryEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#9A4700',
    fontWeight: '800',
  },
  difficultyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  difficultyButton: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  difficultyButtonActive: {
    borderColor: sunrise.orange,
    backgroundColor: sunrise.orangeTint,
    shadowColor: sunrise.orange,
    shadowOpacity: 0.2,
  },
  difficultyEmoji: {
    fontSize: 28,
    marginBottom: 10,
  },
  difficultyLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  difficultyLabelActive: {
    color: '#9A4700',
  },
  difficultyDescription: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 16,
  },
  currentTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 8,
  },
  tag: {
    backgroundColor: sunrise.orange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  tagText: {
    color: sunrise.ink,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
  },
  removeTag: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
  },
  addTagContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    fontWeight: '500',
  },
  addTagButton: {
    backgroundColor: sunrise.orange,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    justifyContent: 'center',
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  addTagButtonText: {
    color: sunrise.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  suggestedTitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
    fontWeight: '600',
  },
  suggestedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedTag: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestedTagAdded: {
    backgroundColor: '#e5e7eb',
    borderColor: '#d1d5db',
  },
  suggestedTagText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestedTagTextAdded: {
    color: '#9ca3af',
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggle: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleActive: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
  },
  toggleText: {
    color: sunrise.ink,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  aiPreview: {
    backgroundColor: sunrise.orangeTint,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: sunrise.orangeTint,
  },
  aiPreviewTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#9A4700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  aiPreviewList: {
    marginLeft: 12,
  },
  aiPreviewItem: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 6,
    fontWeight: '500',
    lineHeight: 20,
  },
});

export default CreateQuestModal;
