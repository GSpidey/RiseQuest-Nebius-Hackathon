export const themeGradients = {
  theme_nature: ['#48bb78', '#38a169'],
  theme_zen: ['#A6B889', '#6D926F'],
  theme_urban: ['#feca57', '#ff9ff3'],
  theme_space: ['#667eea', '#764ba2'],
  theme_ocean: ['#148BB5', '#43C4C7'],
};
export const getThemeGradient = id => themeGradients[id] || ['#FF7A00', '#FFC83D'];
