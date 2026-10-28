import {fetchWithTimeout} from '../services/fetchWithTimeout';
import {deviceLocation} from '../services/deviceLocation';
import { getBackendBaseUrl } from '../config/backendConfig';

export const WeatherService = {
  async getCurrentWeather({ requestPermission = false } = {}) {
    try {
      const coords = await deviceLocation.current({requestPermission});

      const { latitude, longitude } = coords.coords;
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetchWithTimeout(`${baseUrl}/api/weather/current?lat=${latitude}&lon=${longitude}&units=metric`,{},15000);
      const data = await resp.json();
      if (!resp.ok || data?.error) return { error: 'Weather could not refresh. Tap to try again.' };

      let city = data.city;
      if (!city) {
        try {
          const r = await fetchWithTimeout(`${baseUrl}/api/geo/reverse?lat=${latitude}&lon=${longitude}`,{},5000);
          const g = await r.json();
          if (r.ok && !g?.error) {
            city = g.locality || g.formattedAddress || null;
          }
        } catch (_) {
          // ignore
        }
      }

      const temperatureExact = typeof data.temperatureExact === 'number' ? data.temperatureExact : (typeof data.temperature === 'number' ? data.temperature : null);
      const apparentExact = typeof data.apparentTemperatureExact === 'number' ? data.apparentTemperatureExact : (typeof data.apparentTemperature === 'number' ? data.apparentTemperature : null);

      return {
        temperature: data.temperature,
        temperatureExact,
        apparentTemperature: data.apparentTemperature ?? null,
        apparentTemperatureExact: apparentExact,
        asOf: data.asOf || null,
        stale: Boolean(data.stale),
        description: data.description,
        humidity: data.humidity,
        windSpeed: data.windSpeed,
        city,
        icon: this.getWeatherIcon(data.description || ''),
      };
    } catch (error) {
      console.error('Weather fetch error:', error);
      return { error: /Allow location/.test(error?.message||'') ? 'Allow location to see your local weather.' : 'Weather could not refresh. Check location and your connection, then try again.' };
    }
  },

  getWeatherIcon(description) {
    const d = String(description || '').toLowerCase().trim();
    const iconMap = {
      'clear': '🌞',
      'mainly clear': '🌤️',
      'partly cloudy': '⛅',
      'cloudy': '☁️',
      'overcast': '☁️',
      'fog': '🌫️',
      'mist': '🌫️',
      'drizzle': '🌦️',
      'freezing drizzle': '🧊',
      'rain': '🌧️',
      'rain showers': '🌦️',
      'freezing rain': '🧊',
      'snow': '❄️',
      'snow showers': '🌨️',
      'thunderstorm': '⛈️',
      'thunderstorm with hail': '⛈️',
    };

    if (iconMap[d]) return iconMap[d];
    if (d.includes('thunder')) return '⛈️';
    if (d.includes('snow')) return '❄️';
    if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) return '🌧️';
    if (d.includes('fog') || d.includes('mist')) return '🌫️';
    if (d.includes('cloud') || d.includes('overcast')) return '☁️';
    if (d.includes('clear') || d.includes('sun')) return '🌞';
    return '🌤️';
  },

  getWeatherAdvice(weather) {
    if (!weather || weather.error) {
      return "Have a great day! 🌟";
    }

    const { temperature, description } = weather;
    
    if (description.includes('rain')) {
      return "Don't forget your umbrella! ☂️ It's looking rainy today.";
    } else if (temperature > 25) {
      return "It's going to be warm today! 🌞 Stay hydrated and wear light clothes.";
    } else if (temperature < 10) {
      return "Bundle up! 🧥 It's quite chilly outside today.";
    } else if (description.includes('sunny')) {
      return "Beautiful sunny day ahead! 🌅 Perfect weather to seize the day!";
    } else {
      return `It's ${temperature}°C and ${description} today. Have an amazing day! 🌟`;
    }
  },
};

export const MotivationalService = {
  morningQuotes: [
    "Today is a new chapter. Write it well! 📚",
    "Rise and shine! Your dreams are waiting for you! ✨",
    "Every morning is a fresh start. Make it count! 🌅",
    "You're stronger than you think. Prove it today! 💪",
    "Success starts with getting up. You're already winning! 🏆",
    "The best time to start was yesterday. The next best time is now! ⚡",
    "Your future self will thank you for what you do today! 🚀",
    "Wake up with determination, go to bed with satisfaction! 😊",
    "Today's goals: Be awesome, stay awesome! 🌟",
    "You've got this! Make today legendary! 🦸‍♀️",
    "Rise like the sun - bright, powerful, and unstoppable! ☀️",
    "Adventure awaits! Time to go find it! 🗺️",
    "Be the energy you want to attract today! ⚡",
    "Champions are made in the morning! 🏅",
    "Your only limit is your mind. Break free! 🧠✨",
  ],

  motivationalTips: [
    "💡 Tip: Drink water first thing in the morning to kickstart your metabolism!",
    "💡 Tip: Make your bed - start your day with an instant win!",
    "💡 Tip: Take 5 deep breaths to center yourself for the day ahead.",
    "💡 Tip: Write down 3 things you're grateful for this morning.",
    "💡 Tip: Do 10 jumping jacks to get your blood flowing!",
    "💡 Tip: Set one small goal for today and crush it!",
    "💡 Tip: Smile in the mirror - you're about to have an amazing day!",
    "💡 Tip: Listen to your favorite upbeat song while getting ready.",
    "💡 Tip: Plan something fun for later today to look forward to!",
    "💡 Tip: Remember: progress over perfection, always!",
  ],

  getPersonalizedMessage(userStats, importance) {
    const { level, streak, totalWakeUps } = userStats;
    
    const messages = [];
    
    // Level-based messages
    if (level >= 10) {
      messages.push(`Level ${level} Champion! You're absolutely crushing it! 🏆`);
    } else if (level >= 5) {
      messages.push(`Level ${level} Warrior! Your consistency is inspiring! ⚔️`);
    } else {
      messages.push(`Level ${level} Rising Star! Keep building those habits! ⭐`);
    }

    // Streak-based messages
    if (streak >= 30) {
      messages.push(`🔥 ${streak} day streak! You're on fire! Nothing can stop you now!`);
    } else if (streak >= 7) {
      messages.push(`💫 ${streak} days strong! You're building something amazing!`);
    } else if (streak >= 3) {
      messages.push(`🌱 ${streak} day streak! Your dedication is growing!`);
    } else if (streak === 0) {
      messages.push(`🚀 Fresh start! Today is the perfect day to begin again!`);
    }

    // Importance-based urgency
    if (importance === 'critical') {
      messages.push(`🚨 This is CRITICAL! You've got something super important today!`);
    } else if (importance === 'high') {
      messages.push(`⚡ High priority day! Time to show the world what you're made of!`);
    }

    // Total wake-ups milestone
    if (totalWakeUps > 0 && totalWakeUps % 50 === 0) {
      messages.push(`🎉 Milestone Alert! This is your ${totalWakeUps}th successful wake-up!`);
    }

    return messages.join(' ');
  },

  getRandomQuote() {
    return this.morningQuotes[Math.floor(Math.random() * this.morningQuotes.length)];
  },

  getRandomTip() {
    return this.motivationalTips[Math.floor(Math.random() * this.motivationalTips.length)];
  },

  getDayOfWeekMotivation() {
    const days = {
      0: "Sunday Funday! 🌈 Rest, recharge, and prepare for an amazing week!",
      1: "Monday Motivation! 💪 Start the week strong and set the tone!",
      2: "Tuesday Triumph! 🎯 You're building momentum - keep it going!",
      3: "Wednesday Warrior! ⚔️ Halfway through the week - you've got this!",
      4: "Thursday Thunder! ⚡ Push through - the weekend is almost here!",
      5: "Friday Fire! 🔥 Finish the week strong and celebrate your wins!",
      6: "Saturday Success! 🌟 Perfect day to achieve your personal goals!",
    };
    
    const today = new Date().getDay();
    return days[today];
  },

  async getCompleteMotivationalMessage(userStats, importance, weather) {
    const personalizedMessage = this.getPersonalizedMessage(userStats, importance);
    const dayMotivation = this.getDayOfWeekMotivation();
    const randomQuote = this.getRandomQuote();
    const weatherAdvice = WeatherService.getWeatherAdvice(weather);
    const tip = this.getRandomTip();

    return {
      greeting: personalizedMessage,
      dayMessage: dayMotivation,
      quote: randomQuote,
      weather: weatherAdvice,
      tip: tip,
      fullMessage: `${personalizedMessage}\n\n${dayMotivation}\n\n"${randomQuote}"\n\n${weatherAdvice}\n\n${tip}`,
    };
  },
};
