import PushNotification from 'react-native-push-notification';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MultiStageService = {
  toNotificationIntId(value) {
    const str = String(value || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const positive = Math.abs(hash);
    const max = 2147483647;
    return (positive % (max - 1)) + 1;
  },
  async createMultiStageAlarm(alarmData) {
    try {
      const stages = this.generateAlarmStages(alarmData);
      const scheduledStages = [];

      for (const stage of stages) {
        const notificationId = await this.scheduleStageNotification(stage, alarmData);
        scheduledStages.push({
          ...stage,
          notificationId,
          scheduled: true,
        });
      }

      // Save multi-stage alarm data
      const multiStageAlarm = {
        id: alarmData.id,
        originalAlarm: alarmData,
        stages: scheduledStages,
        createdAt: Date.now(),
      };

      await this.saveMultiStageAlarm(multiStageAlarm);
      return multiStageAlarm;
    } catch (error) {
      console.error('Error creating multi-stage alarm:', error);
      throw error;
    }
  },

  generateAlarmStages(alarmData) {
    const stages = [];
    const mainTime = this.parseTime(alarmData.time);
    
    // Stage 1: Pre-wake gentle chime (15 minutes before)
    if (alarmData.preWakeEnabled !== false) {
      stages.push({
        id: 'pre-wake',
        name: 'Pre-wake Chime',
        time: new Date(mainTime.getTime() - 15 * 60 * 1000),
        type: 'gentle',
        volume: 0.3,
        duration: 30, // seconds
        sound: 'gentle-chime',
        vibration: 'light',
        message: '🌅 Gentle wake preparation...',
        importance: 'low',
      });
    }

    // Stage 2: Sleep cycle optimization (5 minutes before)
    if (alarmData.sleepCycleOptimization !== false) {
      stages.push({
        id: 'sleep-cycle',
        name: 'Sleep Cycle Alert',
        time: new Date(mainTime.getTime() - 5 * 60 * 1000),
        type: 'soft',
        volume: 0.5,
        duration: 45,
        sound: 'nature-sounds',
        vibration: 'medium',
        message: '💤 Preparing for optimal wake-up...',
        importance: 'low',
      });
    }

    // Stage 3: Main alarm
    stages.push({
      id: 'main',
      name: 'Main Alarm',
      time: mainTime,
      type: 'full',
      volume: this.getVolumeForImportance(alarmData.importance),
      duration: 300, // 5 minutes
      sound: alarmData.selectedTone || 'default',
      vibration: 'strong',
      message: alarmData.customMessage || 'Time to wake up!',
      importance: alarmData.importance || 'medium',
    });

    // Stage 4: Escalation (5 minutes after if not dismissed)
    if (alarmData.escalationEnabled !== false) {
      stages.push({
        id: 'escalation',
        name: 'Escalation Alert',
        time: new Date(mainTime.getTime() + 5 * 60 * 1000),
        type: 'escalated',
        volume: 1.0,
        duration: 180,
        sound: 'urgent-alarm',
        vibration: 'urgent',
        message: '🚨 Wake up now! This is important!',
        importance: 'critical',
      });
    }

    // Stage 5: Emergency backup (10 minutes after)
    if (alarmData.emergencyBackup !== false) {
      stages.push({
        id: 'emergency',
        name: 'Emergency Backup',
        time: new Date(mainTime.getTime() + 10 * 60 * 1000),
        type: 'emergency',
        volume: 1.0,
        duration: 600, // 10 minutes
        sound: 'emergency-siren',
        vibration: 'emergency',
        message: '🆘 Emergency wake-up! Contacting backup contacts...',
        importance: 'critical',
        triggerEmergency: true,
      });
    }

    return stages;
  },

  parseTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const time = new Date();
    time.setHours(hours, minutes, 0, 0);
    
    // If time is in the past, schedule for tomorrow
    if (time.getTime() <= Date.now()) {
      time.setDate(time.getDate() + 1);
    }
    
    return time;
  },

  getVolumeForImportance(importance) {
    const volumeMap = {
      low: 0.4,
      medium: 0.7,
      high: 0.9,
      critical: 1.0,
    };
    return volumeMap[importance] || 0.7;
  },

  async scheduleStageNotification(stage, alarmData) {
    try {
      const notificationId = this.toNotificationIntId(`${alarmData.id}_${stage.id}_${stage.time.getTime()}`);
      const notificationContent = {
        title: this.getStageTitle(stage, alarmData),
        body: stage.message,
        sound: this.getSoundFile(stage.sound),
        priority: stage.importance === 'critical' ? 'high' : 'normal',
        data: {
          stageId: stage.id,
          alarmId: alarmData.id,
          stageType: stage.type,
          triggerEmergency: stage.triggerEmergency || false,
        },
      };

      PushNotification.localNotificationSchedule({
        id: notificationId,
        title: notificationContent.title,
        message: notificationContent.body,
        date: stage.time,
        allowWhileIdle: true,
        playSound: true,
        soundName: 'default',
        userInfo: notificationContent.data,
        priority: stage.importance === 'critical' ? 'max' : 'high',
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling stage notification:', error);
      throw error;
    }
  },

  getStageTitle(stage, alarmData) {
    const titles = {
      'pre-wake': `🌅 ${alarmData.title || 'Gentle Wake Preparation'}`,
      'sleep-cycle': `💤 ${alarmData.title || 'Sleep Cycle Alert'}`,
      'main': `⏰ ${alarmData.title || 'RiseQuest Alarm'}`,
      'escalation': `🚨 ${alarmData.title || 'Wake Up Alert'}`,
      'emergency': `🆘 ${alarmData.title || 'Emergency Wake-Up'}`,
    };
    return titles[stage.id] || alarmData.title || 'RiseQuest Alarm';
  },

  getSoundFile(soundName) {
    // Map sound names to actual sound files
    const soundMap = {
      'gentle-chime': 'default', // In real app, use custom sound files
      'nature-sounds': 'default',
      'default': 'default',
      'urgent-alarm': 'default',
      'emergency-siren': 'default',
    };
    return soundMap[soundName] || 'default';
  },

  async saveMultiStageAlarm(multiStageAlarm) {
    try {
      const existingAlarms = await this.getMultiStageAlarms();
      const updatedAlarms = existingAlarms.filter(alarm => alarm.id !== multiStageAlarm.id);
      updatedAlarms.push(multiStageAlarm);
      await AsyncStorage.setItem('multiStageAlarms', JSON.stringify(updatedAlarms));
    } catch (error) {
      console.error('Error saving multi-stage alarm:', error);
      throw error;
    }
  },

  async getMultiStageAlarms() {
    try {
      const alarms = await AsyncStorage.getItem('multiStageAlarms');
      return alarms ? JSON.parse(alarms) : [];
    } catch (error) {
      console.error('Error getting multi-stage alarms:', error);
      return [];
    }
  },

  async cancelMultiStageAlarm(alarmId) {
    try {
      const multiStageAlarms = await this.getMultiStageAlarms();
      const alarm = multiStageAlarms.find(a => a.id === alarmId);
      
      if (alarm) {
        // Cancel all scheduled notifications for this alarm
        for (const stage of alarm.stages) {
          if (stage.notificationId) {
            PushNotification.cancelLocalNotifications({ id: stage.notificationId });
          }
        }
        
        // Remove from storage
        const updatedAlarms = multiStageAlarms.filter(a => a.id !== alarmId);
        await AsyncStorage.setItem('multiStageAlarms', JSON.stringify(updatedAlarms));
      }
    } catch (error) {
      console.error('Error canceling multi-stage alarm:', error);
      throw error;
    }
  },

  async handleStageActivation(notificationData) {
    try {
      const { stageId, alarmId, stageType, triggerEmergency } = notificationData;
      
      console.log(`Activating stage: ${stageId} for alarm: ${alarmId}`);
      
      // Handle emergency trigger
      if (triggerEmergency) {
        const EmergencyService = require('./EmergencyService').EmergencyService;
        const multiStageAlarms = await this.getMultiStageAlarms();
        const alarm = multiStageAlarms.find(a => a.id === alarmId);
        
        if (alarm) {
          await EmergencyService.triggerEmergencyBackup(alarm.originalAlarm, 3);
        }
      }
      
      // Update stage status
      await this.updateStageStatus(alarmId, stageId, 'activated');
      
      return {
        success: true,
        stageId,
        alarmId,
        stageType,
      };
    } catch (error) {
      console.error('Error handling stage activation:', error);
      return { success: false, error: error.message };
    }
  },

  async updateStageStatus(alarmId, stageId, status) {
    try {
      const multiStageAlarms = await this.getMultiStageAlarms();
      const alarmIndex = multiStageAlarms.findIndex(a => a.id === alarmId);
      
      if (alarmIndex !== -1) {
        const stageIndex = multiStageAlarms[alarmIndex].stages.findIndex(s => s.id === stageId);
        if (stageIndex !== -1) {
          multiStageAlarms[alarmIndex].stages[stageIndex].status = status;
          multiStageAlarms[alarmIndex].stages[stageIndex].statusUpdated = Date.now();
          await AsyncStorage.setItem('multiStageAlarms', JSON.stringify(multiStageAlarms));
        }
      }
    } catch (error) {
      console.error('Error updating stage status:', error);
    }
  },

  async dismissStage(alarmId, stageId) {
    try {
      await this.updateStageStatus(alarmId, stageId, 'dismissed');
      
      // Cancel remaining stages if main alarm is dismissed
      if (stageId === 'main') {
        await this.cancelRemainingStages(alarmId);
      }
    } catch (error) {
      console.error('Error dismissing stage:', error);
    }
  },

  async cancelRemainingStages(alarmId) {
    try {
      const multiStageAlarms = await this.getMultiStageAlarms();
      const alarm = multiStageAlarms.find(a => a.id === alarmId);
      
      if (alarm) {
        const remainingStages = alarm.stages.filter(stage => 
          stage.time.getTime() > Date.now() && stage.id !== 'main'
        );
        
        for (const stage of remainingStages) {
          if (stage.notificationId) {
            PushNotification.cancelLocalNotifications({ id: stage.notificationId });
          }
          await this.updateStageStatus(alarmId, stage.id, 'cancelled');
        }
      }
    } catch (error) {
      console.error('Error canceling remaining stages:', error);
    }
  },

  getMultiStageSettings() {
    return {
      preWakeEnabled: true,
      preWakeMinutes: 15,
      sleepCycleOptimization: true,
      escalationEnabled: true,
      escalationMinutes: 5,
      emergencyBackup: true,
      emergencyMinutes: 10,
      gradualVolumeIncrease: true,
      adaptiveStaging: true,
    };
  },

  async getAlarmStageHistory(alarmId) {
    try {
      const multiStageAlarms = await this.getMultiStageAlarms();
      const alarm = multiStageAlarms.find(a => a.id === alarmId);
      
      if (alarm) {
        return alarm.stages.map(stage => ({
          id: stage.id,
          name: stage.name,
          time: stage.time,
          status: stage.status || 'pending',
          statusUpdated: stage.statusUpdated,
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error getting alarm stage history:', error);
      return [];
    }
  },
};
