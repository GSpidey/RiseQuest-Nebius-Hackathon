import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { GoogleAuthService } from '../services/GoogleAuthService';
import LinearGradient from 'react-native-linear-gradient';

const GoogleSignInComponent = ({ onSignInSuccess, onSignInError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    initializeGoogleAuth();
  }, []);

  const initializeGoogleAuth = async () => {
    try {
      await GoogleAuthService.initialize();
      
      // Check if user is already signed in
      const signedIn = await GoogleAuthService.isSignedIn();
      setIsSignedIn(signedIn);
      
      if (signedIn) {
        const currentUser = await GoogleAuthService.getCurrentUser();
        if (currentUser) {
          setUserInfo(currentUser.user);
          onSignInSuccess && onSignInSuccess(currentUser);
        }
      }
    } catch (error) {
      console.error('Google Auth initialization error:', error);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await GoogleAuthService.signIn();
      
      if (result) {
        setIsSignedIn(true);
        setUserInfo(result.user);
        onSignInSuccess && onSignInSuccess(result);
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      onSignInError && onSignInError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const success = await GoogleAuthService.signOut();
      if (success) {
        setIsSignedIn(false);
        setUserInfo(null);
        Alert.alert('Signed Out', 'You have been signed out successfully');
      }
    } catch (error) {
      console.error('Sign-out error:', error);
      Alert.alert('Error', 'Could not sign out. Please try again.');
    }
  };

  if (isSignedIn && userInfo) {
    return (
      <View style={styles.signedInContainer}>
        <View style={styles.userInfoContainer}>
          {userInfo.photo && (
            <Image source={{ uri: userInfo.photo }} style={styles.profileImage} />
          )}
          <View style={styles.userTextContainer}>
            <Text style={styles.userName}>{userInfo.name}</Text>
            <Text style={styles.userEmail}>{userInfo.email}</Text>
            <Text style={styles.syncStatus}>✅ Synced with Google</Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.benefitsContainer}>
        <Text style={styles.title}>🔗 Connect with Google</Text>
        <Text style={styles.subtitle}>
          Link your Google account to sync your progress across devices and unlock enhanced features!
        </Text>
        
        <View style={styles.benefitsList}>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>☁️</Text>
            <Text style={styles.benefitText}>Sync progress across all devices</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🏆</Text>
            <Text style={styles.benefitText}>Never lose your streaks and achievements</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>📍</Text>
            <Text style={styles.benefitText}>Enhanced location-based alarms</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🔒</Text>
            <Text style={styles.benefitText}>Secure backup of your data</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>⚡</Text>
            <Text style={styles.benefitText}>Faster app performance</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.signInButton}
        onPress={handleSignIn}
        disabled={isLoading}
      >
        <LinearGradient
          colors={['#4285f4', '#34a853', '#fbbc05', '#ea4335']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.signInButtonGradient}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Image 
                source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }} 
                style={styles.googleIcon}
              />
              <Text style={styles.signInButtonText}>Continue with Google</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.privacyText}>
        By signing in, you agree to sync your RiseQuest data with Google. 
        Your privacy is protected and data is encrypted.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  benefitsContainer: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  benefitsList: {
    marginTop: 10,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  benefitIcon: {
    fontSize: 20,
    marginRight: 15,
    width: 30,
    textAlign: 'center',
  },
  benefitText: {
    fontSize: 16,
    color: '#4a5568',
    flex: 1,
  },
  signInButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  signInButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  signInButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  privacyText: {
    fontSize: 12,
    color: '#a0aec0',
    textAlign: 'center',
    marginTop: 15,
    lineHeight: 16,
  },
  
  // Signed In State Styles
  signedInContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    margin: 20,
    borderWidth: 2,
    borderColor: '#48bb78',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  userTextContainer: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 4,
  },
  syncStatus: {
    fontSize: 12,
    color: '#48bb78',
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#fed7d7',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#e53e3e',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GoogleSignInComponent;
