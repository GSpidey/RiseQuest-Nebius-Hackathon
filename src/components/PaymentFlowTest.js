import { AppAlert as Alert } from './AppModal';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MonetizationService } from '../utils/MonetizationService';
import { GoogleLocationService } from '../services/GoogleLocationService';
import { getBackendBaseUrl } from '../config/backendConfig';

/**
 * Payment Flow Test Component
 * Tests end-to-end payment processing with regional pricing
 */
const PaymentFlowTest = ({ onTestComplete }) => {
  const [testResults, setTestResults] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [userRegion, setUserRegion] = useState('DEFAULT');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    detectUserRegion();
  }, []);

  const detectUserRegion = async () => {
    try {
      const region = await MonetizationService.detectUserRegion();
      setUserRegion(region);
      console.log('🌍 Detected region for testing:', region);
    } catch (error) {
      console.error('Region detection failed:', error);
    }
  };

  const testSuite = [
    {
      id: 'backend_health',
      name: 'Backend Health',
      description: 'Smoke test the Hetzner backend (/health + /api/version)',
      test: async () => {
        const baseUrl = await getBackendBaseUrl();
        const healthResp = await fetch(`${baseUrl}/health`);
        const health = await healthResp.json();
        const versionResp = await fetch(`${baseUrl}/api/version`);
        const version = await versionResp.json();

        const ok = healthResp.ok && versionResp.ok && health?.status === 'healthy';
        return {
          success: ok,
          data: { health, version, baseUrl },
          message: ok ? 'Backend is reachable' : 'Backend health/version check failed',
        };
      },
    },
    {
      id: 'mobile_config',
      name: 'Mobile Config',
      description: 'Verify /api/mobile-config returns Stripe publishable key + feature flags',
      test: async () => {
        const baseUrl = await getBackendBaseUrl();
        const resp = await fetch(`${baseUrl}/api/mobile-config`);
        const cfg = await resp.json();
        const ok = resp.ok && typeof cfg?.stripePublishableKey === 'string' && cfg.stripePublishableKey.length > 10;
        return {
          success: ok,
          data: cfg,
          message: ok ? 'Mobile config OK' : 'Missing/invalid stripePublishableKey from backend',
        };
      },
    },
    {
      id: 'pricing_config',
      name: 'Pricing Config',
      description: 'Verify /api/pricing-config returns real subscription price IDs',
      test: async () => {
        const baseUrl = await getBackendBaseUrl();
        const resp = await fetch(`${baseUrl}/api/pricing-config`);
        const cfg = await resp.json();
        const monthly = cfg?.subscriptions?.monthly?.priceId;
        const yearly = cfg?.subscriptions?.yearly?.priceId;
        const ok = resp.ok && typeof monthly === 'string' && typeof yearly === 'string';
        return {
          success: ok,
          data: cfg,
          message: ok ? 'Pricing config OK' : 'Pricing config missing monthly/yearly priceId',
        };
      },
    },
    {
      id: 'region_detection',
      name: 'Region Detection',
      description: 'Detect user region using device GPS + backend reverse geocode',
      test: async () => {
        const location = await GoogleLocationService.getCurrentLocation();
        const region = await MonetizationService.detectUserRegion();
        return {
          success: !location?.error && !!region,
          data: { location, region },
          message: `Region: ${region}`,
        };
      },
    },
  ];

  const runTest = async (test) => {
    setCurrentTest(test.id);
    try {
      const result = await test.test();
      const testResult = {
        id: test.id,
        name: test.name,
        ...result,
        timestamp: new Date().toISOString()
      };
      
      setTestResults(prev => [...prev, testResult]);
      return testResult;
    } catch (error) {
      const errorResult = {
        id: test.id,
        name: test.name,
        success: false,
        data: { error: error.message },
        message: `Test failed: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      
      setTestResults(prev => [...prev, errorResult]);
      return errorResult;
    } finally {
      setCurrentTest(null);
    }
  };

  const runAllTests = async () => {
    setTesting(true);
    setTestResults([]);
    
    try {
      for (const test of testSuite) {
        await runTest(test);
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      Alert.alert(
        'Tests Complete',
        `${testResults.filter(r => r.success).length}/${testSuite.length} tests passed`,
        [
          { text: 'View Results', onPress: () => {} },
          { text: 'OK' }
        ]
      );
      
      onTestComplete?.(testResults);
    } catch (error) {
      Alert.alert('Test Suite Error', error.message);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (result) => {
    if (result.success) return '✅';
    if (result.note) return '⚠️';
    return '❌';
  };

  const getStatusColor = (result) => {
    if (result.success) return '#4CAF50';
    if (result.note) return '#FF9800';
    return '#F44336';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Payment Flow Test Suite</Text>
        <Text style={styles.headerSubtitle}>Testing Region: {userRegion}</Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Test Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.runButton, testing && styles.runButtonDisabled]}
            onPress={runAllTests}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.runButtonText}>Run All Tests</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Current Test Indicator */}
        {currentTest && (
          <View style={styles.currentTest}>
            <ActivityIndicator size="small" color="#667eea" />
            <Text style={styles.currentTestText}>
              Running: {testSuite.find(t => t.id === currentTest)?.name}
            </Text>
          </View>
        )}

        {/* Test Results */}
        {testResults.map((result) => (
          <View key={result.id} style={styles.testResult}>
            <View style={styles.testHeader}>
              <Text style={styles.testIcon}>{getStatusIcon(result)}</Text>
              <View style={styles.testInfo}>
                <Text style={styles.testName}>{result.name}</Text>
                <Text style={[styles.testMessage, { color: getStatusColor(result) }]}>
                  {result.message}
                </Text>
                {result.note && (
                  <Text style={styles.testNote}>Note: {result.note}</Text>
                )}
              </View>
            </View>
            
            {/* Test Data */}
            {result.data && (
              <View style={styles.testData}>
                <Text style={styles.testDataTitle}>Test Data:</Text>
                <Text style={styles.testDataContent}>
                  {JSON.stringify(result.data, null, 2)}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Individual Test Buttons */}
        <View style={styles.individualTests}>
          <Text style={styles.sectionTitle}>Individual Tests</Text>
          {testSuite.map((test) => (
            <TouchableOpacity
              key={test.id}
              style={styles.testButton}
              onPress={() => runTest(test)}
              disabled={testing || currentTest === test.id}
            >
              <Text style={styles.testButtonText}>{test.name}</Text>
              <Text style={styles.testButtonDesc}>{test.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  controls: {
    marginBottom: 20,
  },
  runButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  runButtonDisabled: {
    backgroundColor: '#ccc',
  },
  runButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  currentTest: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    marginBottom: 20,
  },
  currentTestText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#667eea',
    fontWeight: '500',
  },
  testResult: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  testInfo: {
    flex: 1,
  },
  testName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  testMessage: {
    fontSize: 14,
    marginBottom: 3,
  },
  testNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  testData: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  testDataTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  testDataContent: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#666',
  },
  individualTests: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  testButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  testButtonDesc: {
    fontSize: 14,
    color: '#666',
  },
});

export default PaymentFlowTest;

