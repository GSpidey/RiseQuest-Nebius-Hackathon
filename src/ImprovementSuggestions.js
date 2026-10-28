import ModalHeading from './components/ModalHeading';
import Modal, { AppAlert as Alert } from './components/AppModal';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const ImprovementSuggestions = ({ visible, onClose }) => {
  const [likedSuggestions, setLikedSuggestions] = useState([]);

  const suggestions = [
    {
      id: 1,
      category: '🧠 AI & Intelligence',
      title: 'Sleep Pattern AI Coach',
      description: 'AI that learns your sleep patterns and suggests optimal bedtimes, analyzes your sleep quality based on wake-up difficulty, and provides personalized sleep hygiene tips.',
      impact: 'High',
      effort: 'Medium',
      features: [
        'Sleep quality prediction based on wake-up performance',
        'Personalized bedtime recommendations',
        'Weekly sleep reports with insights',
        'Integration with health apps'
      ]
    },
    {
      id: 2,
      category: '🌐 Social & Community',
      title: 'Wake-Up Buddy System',
      description: 'Connect with friends or family for mutual accountability. Challenge each other to wake-up streaks, share morning achievements, and get backup calls from trusted contacts.',
      impact: 'High',
      effort: 'High',
      features: [
        'Friend accountability system',
        'Group challenges and leaderboards',
        'Morning check-ins and encouragement',
        'Family wake-up coordination'
      ]
    },
    {
      id: 3,
      category: '💪 Health & Wellness',
      title: 'Morning Routine Builder',
      description: 'Guided morning routines with exercise, meditation, journaling, and goal-setting. Track completion and build healthy habits that stick.',
      impact: 'High',
      effort: 'Medium',
      features: [
        'Customizable morning routine templates',
        'Guided meditation and breathing exercises',
        'Quick workout suggestions',
        'Habit tracking and streak visualization'
      ]
    },
    {
      id: 4,
      category: '🎵 Audio & Music',
      title: 'Dynamic Soundscapes',
      description: 'Adaptive audio that changes based on weather, your mood, sleep quality, and time of year. Nature sounds, binaural beats, and personalized playlists.',
      impact: 'Medium',
      effort: 'Low',
      features: [
        'Weather-responsive wake-up sounds',
        'Mood-based audio selection',
        'Spotify/Apple Music integration',
        'Binaural beats for energy boosting'
      ]
    },
    {
      id: 5,
      category: '📱 Smart Home Integration',
      title: 'IoT Smart Wake-Up',
      description: 'Control smart lights, thermostats, coffee makers, and other devices to create the perfect wake-up environment automatically.',
      impact: 'High',
      effort: 'High',
      features: [
        'Smart light gradual brightening',
        'Coffee maker auto-start',
        'Temperature adjustment',
        'Smart speaker integration'
      ]
    },
    {
      id: 6,
      category: '🎯 Gamification Plus',
      title: 'Advanced Quest System',
      description: 'Epic quest chains that span weeks or months. Unlock story chapters by maintaining streaks, complete special challenges, and earn exclusive rewards.',
      impact: 'Medium',
      effort: 'Medium',
      features: [
        'Multi-chapter story campaigns',
        'Special seasonal events',
        'Rare collectible rewards',
        'Achievement sharing on social media'
      ]
    },
    {
      id: 7,
      category: '💡 Productivity',
      title: 'Day Planning Assistant',
      description: 'AI-powered day planning that starts right when you wake up. Prioritize tasks, schedule breaks, and get productivity insights.',
      impact: 'High',
      effort: 'Medium',
      features: [
        'Morning task prioritization',
        'Calendar integration',
        'Energy level-based scheduling',
        'End-of-day reflection prompts'
      ]
    },
    {
      id: 8,
      category: '🏆 Analytics & Insights',
      title: 'Deep Sleep Analytics',
      description: 'Comprehensive analytics dashboard showing wake-up trends, productivity correlations, and personalized insights for better sleep habits.',
      impact: 'Medium',
      effort: 'Low',
      features: [
        'Weekly/monthly trend analysis',
        'Correlation insights (weather, mood, productivity)',
        'Exportable reports',
        'Goal setting and tracking'
      ]
    },
    {
      id: 9,
      category: '🌟 Premium Features',
      title: 'Personal Wake-Up Coach',
      description: 'One-on-one sessions with certified sleep coaches, personalized wake-up strategies, and accountability check-ins.',
      impact: 'High',
      effort: 'High',
      features: [
        'Live coaching sessions',
        'Personalized sleep strategies',
        'Weekly accountability calls',
        'Expert-created content library'
      ]
    },
    {
      id: 10,
      category: '🔬 Innovation',
      title: 'Circadian Rhythm Optimization',
      description: 'Advanced light therapy recommendations, meal timing suggestions, and activity scheduling to optimize your natural sleep-wake cycle.',
      impact: 'High',
      effort: 'High',
      features: [
        'Light exposure recommendations',
        'Meal timing optimization',
        'Exercise timing suggestions',
        'Travel jet lag assistance'
      ]
    }
  ];

  const handleLikeSuggestion = (id) => {
    setLikedSuggestions(prev => 
      prev.includes(id) 
        ? prev.filter(suggestionId => suggestionId !== id)
        : [...prev, id]
    );
  };

  const handleSendFeedback = () => {
    const likedTitles = suggestions
      .filter(s => likedSuggestions.includes(s.id))
      .map(s => s.title)
      .join(', ');

    const emailBody = encodeURIComponent(`
Hi RiseQuest Team!

I've reviewed the improvement suggestions and here's my feedback:

Liked Suggestions:
${likedTitles || 'None selected'}

Additional Ideas:
[Please add your own suggestions here]

Priority Features I'd Love to See:
1. 
2. 
3. 

Overall Feedback:
[Share your thoughts on the app and future direction]

Thanks for building such an amazing alarm app!

Best regards,
A loyal RiseQuest user
    `);

    const subject = encodeURIComponent('RiseQuest Feature Feedback & Suggestions');
    const mailtoUrl = `mailto:support@example.invalid?subject=${subject}&body=${emailBody}`;
    
    Linking.openURL(mailtoUrl).then(() => {
      Alert.alert(
        'Feedback Sent!',
        'Thank you for your suggestions! We read every piece of feedback.',
        [{ text: 'Awesome!', onPress: onClose }]
      );
    }).catch(() => {
      Alert.alert(
        'Email Not Available',
        'Please send your feedback to: support@example.invalid'
      );
    });
  };

  const getImpactColor = (impact) => {
    switch (impact.toLowerCase()) {
      case 'high': return '#e53e3e';
      case 'medium': return '#d69e2e';
      case 'low': return '#38a169';
      default: return '#718096';
    }
  };

  const getEffortColor = (effort) => {
    switch (effort.toLowerCase()) {
      case 'high': return '#e53e3e';
      case 'medium': return '#d69e2e';
      case 'low': return '#38a169';
      default: return '#718096';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
        <View style={styles.header}>
          <ModalHeading compact light title="Future Features" icon="sparkles"/>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.intro}>
          <Text style={styles.introTitle}>Help Shape RiseQuest's Future!</Text>
          <Text style={styles.introText}>
            We're constantly improving RiseQuest. Check out these potential features and 
            let us know which ones excite you most! 🚀
          </Text>
        </View>

        <View style={styles.content}>
          <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            {suggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.suggestionCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.category}>{suggestion.category}</Text>
                  <TouchableOpacity 
                    style={[
                      styles.likeButton,
                      likedSuggestions.includes(suggestion.id) && styles.likeButtonActive
                    ]}
                    onPress={() => handleLikeSuggestion(suggestion.id)}
                  >
                    <Text style={[
                      styles.likeButtonText,
                      likedSuggestions.includes(suggestion.id) && styles.likeButtonTextActive
                    ]}>
                      {likedSuggestions.includes(suggestion.id) ? '❤️' : '🤍'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
                
                <View style={styles.featuresList}>
                  {suggestion.features.map((feature, index) => (
                    <Text key={index} style={styles.featureItem}>
                      • {feature}
                    </Text>
                  ))}
                </View>
                
                <View style={styles.cardFooter}>
                  <View style={styles.badges}>
                    <View style={[styles.badge, { backgroundColor: getImpactColor(suggestion.impact) }]}>
                      <Text style={styles.badgeText}>Impact: {suggestion.impact}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: getEffortColor(suggestion.effort) }]}>
                      <Text style={styles.badgeText}>Effort: {suggestion.effort}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            
            <View style={styles.feedbackSection}>
              <Text style={styles.feedbackTitle}>💬 Have Your Own Ideas?</Text>
              <Text style={styles.feedbackText}>
                We'd love to hear your suggestions! Send us your feature ideas, 
                improvements, or feedback.
              </Text>
              
              <TouchableOpacity style={styles.feedbackButton} onPress={handleSendFeedback}>
                <Text style={styles.feedbackButtonText}>
                  📧 Send Feedback ({likedSuggestions.length} liked)
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  intro: {
    padding: 20,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  introText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  scrollContainer: {
    flex: 1,
    padding: 20,
  },
  suggestionCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  category: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea',
  },
  likeButton: {
    padding: 5,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f7fafc',
  },
  likeButtonActive: {
    backgroundColor: '#feb2b2',
    borderColor: '#e53e3e',
  },
  likeButtonText: {
    fontSize: 16,
  },
  likeButtonTextActive: {
    // No additional styles needed for emoji
  },
  suggestionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 8,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
    marginBottom: 15,
  },
  featuresList: {
    marginBottom: 15,
  },
  featureItem: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 4,
    paddingLeft: 5,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 15,
  },
  badges: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  feedbackSection: {
    backgroundColor: '#f7fafc',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 10,
  },
  feedbackText: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  feedbackButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  feedbackButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ImprovementSuggestions;

